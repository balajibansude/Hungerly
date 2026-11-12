import { useQuery, type QueryResult } from '@hungerly/app-core';
import { ConfirmDialog, IconButton, Screen, screenGutter, spacing, Text } from '@hungerly/ui';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { LoginReason } from '@/features/auth/loginReasons';
import { useSessionStore } from '@/features/auth/session';
import { useRefetchOnFocus } from '@/features/addresses/useRefetchOnFocus';
import { useCartStore } from '@/features/cart/store';
import { useFavoritesStore } from '@/features/favorites/store';
import { countActiveOffers } from '@/features/offers/offerDetails';
import { ProfileCard } from '@/features/profile/components/ProfileCard';
import { MenuRow, MenuSection, SwitchMenuRow } from '@/features/profile/components/ProfileMenu';
import { SummaryGrid } from '@/features/profile/components/SummaryGrid';
import { countSubtitle, plural, type SummarySource } from '@/features/profile/summary';
import { unavailableFeatures, type UnavailableFeature } from '@/features/profile/unavailable';
import { useServices, userMessage } from '@/services';

/** A count from account data: only signed-in customers have one. */
function countSource<T>(
  signedIn: boolean,
  result: QueryResult<T>,
  count: (data: T) => { count: number; hasMore?: boolean },
): SummarySource {
  if (!signedIn) return { kind: 'signed_out' };
  if (result.status === 'loading') return { kind: 'loading' };
  if (result.status === 'error') return { kind: 'error' };
  return { kind: 'count', ...count(result.data) };
}

type Dialog = { title: string; message: string };

export default function ProfileScreen() {
  const { auth, orders, location, offers } = useServices();
  const user = useSessionStore((s) => s.session?.user);
  const signOut = useSessionStore((s) => s.signOut);
  const clearCart = useCartStore((s) => s.clear);
  const savedIds = useFavoritesStore((s) => s.ids);
  const signedIn = user !== undefined;
  const owner = user?.id ?? 'guest';

  // Account data is requested only for signed-in customers; keys include the user so a
  // different account never sees the previous one's numbers.
  const orderPage = useQuery(`profile-orders:${owner}`, () =>
    signedIn ? orders.listOrders() : Promise.resolve(null),
  );
  const address = useQuery(`profile-address:${owner}`, () =>
    signedIn ? location.listAddresses() : Promise.resolve(null),
  );
  // Addresses can be added or removed on the addresses screen.
  useRefetchOnFocus(address.refetch);
  const offerList = useQuery('offers', () => offers.listAvailable());
  const now = useMemo(() => new Date(), []);

  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const ordersSource = countSource(signedIn, orderPage, (page) => ({
    count: page?.items.length ?? 0,
    hasMore: Boolean(page?.nextCursor),
  }));
  const addressSource = countSource(signedIn, address, (data) => ({
    count: data?.addresses.length ?? 0,
  }));
  const offersSource: SummarySource =
    offerList.status === 'success'
      ? { kind: 'count', count: countActiveOffers(offerList.data, now) }
      : { kind: offerList.status };
  const savedSource: SummarySource = signedIn
    ? { kind: 'count', count: savedIds.length }
    : { kind: 'signed_out' };

  const explain = (feature: UnavailableFeature) => setDialog(unavailableFeatures[feature]);
  const login = (reason: LoginReason) => router.push({ pathname: '/login', params: { reason } });

  const logOut = async () => {
    setConfirmLogout(false);
    try {
      await auth.signOut();
    } finally {
      clearCart();
      // Tabs stay available: the customer simply continues as a guest.
      signOut();
    }
  };

  const deleteAccount = async () => {
    setConfirmDelete(false);
    try {
      await auth.requestAccountDeletion();
      clearCart();
      signOut();
      setDialog({
        title: 'Deletion requested',
        message:
          'You have been logged out. Your personal data will be erased within 30 days; order records required by law are kept anonymised.',
      });
    } catch (e) {
      setDialog({ title: 'Your account was not deleted', message: userMessage(e) });
    }
  };

  return (
    <Screen background="surface">
      <View style={styles.header}>
        <IconButton
          icon="arrow-back"
          variant="ghost"
          accessibilityLabel="Go back"
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/home'))}
        />
        <View style={styles.titles}>
          <Text variant="h1" accessibilityRole="header">
            My Profile
          </Text>
          <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
            Manage your account and preferences
          </Text>
        </View>
        {/* No inbox exists yet, so there is never an unread indicator. */}
        <IconButton
          icon="notifications-outline"
          variant="ghost"
          accessibilityLabel="Notifications"
          onPress={() => explain('notifications')}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ProfileCard
          user={user}
          onEdit={() => router.push('/profile-setup')}
          onLogin={() => login('account')}
          summary={
            <SummaryGrid
              items={[
                {
                  key: 'orders',
                  icon: 'bag-handle-outline',
                  label: 'Orders',
                  source: ordersSource,
                },
                {
                  key: 'wallet',
                  icon: 'wallet-outline',
                  label: 'Wallet',
                  source: { kind: 'unavailable' },
                },
                { key: 'offers', icon: 'pricetag-outline', label: 'Offers', source: offersSource },
                { key: 'saved', icon: 'heart-outline', label: 'Saved', source: savedSource },
              ]}
            />
          }
        />

        <MenuSection title="Quick access">
          <MenuRow
            icon="location-outline"
            title="My Addresses"
            subtitle={
              signedIn
                ? countSubtitle(addressSource, {
                    singular: 'saved address',
                    plural: 'saved addresses',
                    empty: 'No saved addresses',
                    fallback: 'Your delivery addresses',
                  })
                : 'Log in to manage addresses'
            }
            onPress={() => (signedIn ? router.push('/addresses') : login('account'))}
            testID="row-addresses"
          />
          <MenuRow
            icon="card-outline"
            title="Payments"
            subtitle="Payment methods and wallet"
            comingSoon
            onPress={() => explain('payments')}
          />
          <MenuRow
            icon="heart-outline"
            title="Favourites"
            subtitle={
              signedIn ? plural(savedIds.length, 'saved restaurant') : 'Log in to save restaurants'
            }
            onPress={() => (signedIn ? router.push('/favorites') : login('favorites'))}
            testID="row-favorites"
          />
          <MenuRow
            icon="pricetags-outline"
            title="My Offers"
            subtitle={countSubtitle(offersSource, {
              singular: 'active offer',
              empty: 'No active offers',
              fallback: 'Discounts you can use',
            })}
            onPress={() => router.navigate('/offers')}
            testID="row-offers"
          />
          <MenuRow
            icon="trophy-outline"
            title="City Leaderboard"
            subtitle="Top 3 customers each month win offers"
            onPress={() => router.push('/leaderboard')}
            testID="row-leaderboard"
          />
          <MenuRow
            icon="gift-outline"
            title="Scratch Cards"
            subtitle="View and scratch your reward coupons"
            comingSoon
            onPress={() => explain('scratchCards')}
          />
          <MenuRow
            icon="share-social-outline"
            title="Refer & Earn"
            subtitle="Invite friends and earn rewards"
            comingSoon
            onPress={() => explain('referrals')}
          />
        </MenuSection>

        <MenuSection title="My activity">
          <MenuRow
            icon="time-outline"
            title="Order History"
            subtitle={
              signedIn
                ? countSubtitle(ordersSource, {
                    singular: 'past order',
                    empty: 'No past orders yet',
                    fallback: 'Your past orders',
                  })
                : 'Log in to see your orders'
            }
            onPress={() => router.navigate('/orders')}
            testID="row-order-history"
          />
        </MenuSection>

        <MenuSection title="Appearance">
          {/* The glass home screen has not been built, so the setting cannot be turned on. */}
          <SwitchMenuRow
            icon="sparkles-outline"
            title="New Home (Glass)"
            subtitle="The redesigned glass home screen isn’t available yet"
            value={false}
            onValueChange={() => undefined}
            disabled
          />
        </MenuSection>

        <MenuSection title="Support & info">
          <MenuRow
            icon="notifications-outline"
            title="Notification Preferences"
            subtitle="Choose what you get notified about"
            comingSoon
            onPress={() => explain('notificationPreferences')}
          />
          <MenuRow
            icon="headset-outline"
            title="Help & Support"
            subtitle="FAQs, contact us & more"
            comingSoon
            onPress={() => explain('help')}
          />
          <MenuRow
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            subtitle="Learn how we protect your data"
            comingSoon
            onPress={() => explain('privacy')}
          />
          <MenuRow
            icon="document-text-outline"
            title="Terms & Conditions"
            subtitle="Read our terms and conditions"
            comingSoon
            onPress={() => explain('terms')}
          />
        </MenuSection>

        {signedIn && (
          <MenuSection title="Account">
            <MenuRow
              icon="log-out-outline"
              title="Logout"
              subtitle="Sign out from your account"
              tone="danger"
              onPress={() => setConfirmLogout(true)}
              testID="row-logout"
            />
            <MenuRow
              icon="trash-outline"
              title="Delete Account"
              subtitle="Permanently remove your account access"
              tone="danger"
              onPress={() => setConfirmDelete(true)}
              testID="row-delete-account"
            />
          </MenuSection>
        )}

        <Text variant="caption" color="textTertiary" align="center">
          Swaadone prototype · data shown is sample data
        </Text>
      </ScrollView>

      <ConfirmDialog
        visible={confirmLogout}
        title="Log out?"
        message="Your cart will be cleared. You can keep browsing as a guest."
        confirmLabel="Log out"
        destructive
        onCancel={() => setConfirmLogout(false)}
        onConfirm={logOut}
      />
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete your account?"
        message="You will be logged out on all devices and your personal details, addresses and favourites will be erased. Order records required by law are kept anonymised. This cannot be undone."
        confirmLabel="Delete account"
        cancelLabel="Keep account"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteAccount}
      />
      <ConfirmDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel="OK"
        cancelLabel={null}
        onCancel={() => setDialog(null)}
        onConfirm={() => setDialog(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: screenGutter - spacing.sm,
    paddingVertical: spacing.sm,
  },
  titles: { flex: 1 },
  content: { padding: screenGutter, paddingTop: spacing.sm, gap: spacing['2xl'] },
});
