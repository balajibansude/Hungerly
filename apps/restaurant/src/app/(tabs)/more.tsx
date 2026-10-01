import type { PartnerRestaurant } from '@hungerly/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  colors,
  ConfirmDialog,
  Divider,
  ErrorState,
  Icon,
  Screen,
  screenGutter,
  Skeleton,
  spacing,
  Text,
  type IconName,
} from '@hungerly/ui';
import { formatE164India } from '@hungerly/utils';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { activeMembership, useSessionStore } from '@/features/auth/session';
import { useSignOut } from '@/features/auth/useSignOut';
import { intakeStatusFor, roleLabel } from '@/features/restaurant/status';
import { useActiveRestaurant } from '@/features/restaurant/useActiveRestaurant';
import { TabHeader } from '@/features/shell/TabHeader';
import { userMessage } from '@/services';

/** Settings that arrive with later phases (R14, R18, R19). */
const upcoming: { icon: IconName; label: string }[] = [
  { icon: 'storefront-outline', label: 'Restaurant profile' },
  { icon: 'time-outline', label: 'Opening hours & availability' },
  { icon: 'notifications-outline', label: 'Notifications' },
];

function RestaurantSummary({ restaurant }: { restaurant: PartnerRestaurant }) {
  const status = intakeStatusFor(restaurant, new Date());
  const { address } = restaurant;
  return (
    <Card style={styles.summary}>
      <View style={styles.summaryTitle}>
        <Text variant="h2" numberOfLines={2} style={styles.flex}>
          {restaurant.name}
        </Text>
        <Badge label={status.label} tone={status.tone} />
      </View>
      <Text variant="bodySmall" color="textSecondary">
        {restaurant.cuisines.join(' · ')}
      </Text>
      <View style={styles.line}>
        <Icon name="location-outline" size="sm" color="textSecondary" />
        <Text variant="bodySmall" color="textSecondary" style={styles.flex}>
          {address.line1}, {address.locality}, {address.city} {address.postalCode}
        </Text>
      </View>
      <Text variant="bodySmall" color="textTertiary">
        {status.detail}
      </Text>
    </Card>
  );
}

function RestaurantSummarySkeleton() {
  return (
    <Card style={styles.summary}>
      <Skeleton height={26} width="60%" />
      <Skeleton height={16} width="40%" />
      <Skeleton height={16} width="85%" />
    </Card>
  );
}

/** More: the restaurant, the signed-in account, settings that arrive later, and log out. */
export default function MoreScreen() {
  const session = useSessionStore((s) => s.session);
  const membership = activeMembership(session);
  const restaurant = useActiveRestaurant();
  const { signOut, signingOut } = useSignOut();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const user = session?.user;

  return (
    <Screen edges={['top']}>
      <TabHeader title="More" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text variant="h3" accessibilityRole="header">
            Restaurant
          </Text>
          {restaurant.status === 'loading' ? (
            <RestaurantSummarySkeleton />
          ) : restaurant.status === 'error' ? (
            <Card>
              <ErrorState
                title="Couldn’t load your restaurant"
                message={userMessage(restaurant.error)}
                onRetry={restaurant.refetch}
              />
            </Card>
          ) : (
            <RestaurantSummary restaurant={restaurant.data} />
          )}
        </View>

        <View style={styles.section}>
          <Text variant="h3" accessibilityRole="header">
            Account
          </Text>
          <Card style={styles.account}>
            <Avatar name={user?.fullName ?? null} size={56} />
            <View style={styles.flex}>
              <Text variant="h3" numberOfLines={1}>
                {user?.fullName ?? 'Restaurant team member'}
              </Text>
              {user?.phoneE164 && (
                <Text variant="bodySmall" color="textSecondary">
                  {formatE164India(user.phoneE164)}
                </Text>
              )}
              {user?.email && (
                <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
                  {user.email}
                </Text>
              )}
            </View>
            {membership && <Badge label={roleLabel(membership.role)} tone="dark" />}
          </Card>
        </View>

        <Card>
          {upcoming.map((item, index) => (
            <View key={item.label}>
              {index > 0 && <Divider />}
              <View style={styles.row} accessible accessibilityLabel={`${item.label}, coming soon`}>
                <Icon name={item.icon} color="textSecondary" />
                <Text variant="body" style={styles.flex}>
                  {item.label}
                </Text>
                <Badge label="Soon" tone="neutral" style={styles.centered} />
              </View>
            </View>
          ))}
        </Card>

        <Button
          label="Log out"
          variant="outline"
          icon="log-out-outline"
          onPress={() => setConfirmingSignOut(true)}
          loading={signingOut}
          fullWidth
        />
        <Text variant="caption" color="textTertiary" align="center">
          Hungerly Partner prototype · data shown is sample data
        </Text>
      </ScrollView>

      <ConfirmDialog
        visible={confirmingSignOut}
        title="Log out?"
        message="You won’t receive new order alerts on this device until you log in again."
        confirmLabel="Log out"
        cancelLabel="Stay logged in"
        destructive
        onConfirm={() => {
          setConfirmingSignOut(false);
          void signOut();
        }}
        onCancel={() => setConfirmingSignOut(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { alignSelf: 'center' },
  content: {
    paddingHorizontal: screenGutter,
    paddingBottom: spacing['3xl'],
    gap: spacing['2xl'],
  },
  section: { gap: spacing.sm },
  summary: { padding: spacing.lg, gap: spacing.sm },
  summaryTitle: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
  },
});
