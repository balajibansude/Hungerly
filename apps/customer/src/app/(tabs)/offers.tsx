import { useQuery } from '@hungerly/app-core';
import {
  colors,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  radius,
  Screen,
  screenGutter,
  SectionHeader,
  Skeleton,
  spacing,
  Text,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { CART_BAR_SPACE, CartBar } from '@/features/cart/components/CartBar';
import { sortOpenFirst } from '@/features/food/availability';
import { FoodGrid } from '@/features/food/components/FoodCollections';
import { FoodPreferenceChips } from '@/features/food/components/FoodPreference';
import { filterByPreference, useFoodPreferenceStore } from '@/features/food/preference';
import { useDishCartControls, useSyncCartAvailability } from '@/features/food/useDishCartControls';
import { OfferBanner } from '@/features/offers/components/OfferBanner';
import { offerStatus, offerTerms, sortOffers } from '@/features/offers/offerDetails';
import { useServices, type OfferListing } from '@/services';

/**
 * Offers tab: every offer as a large banner, then dishes with a deal. Also reached from
 * Home ("See all") and Profile → My Offers, which switch to this tab.
 */
export default function OffersScreen() {
  const { offers, catalog } = useServices();
  const result = useQuery('offers', () => offers.listAvailable());
  const deals = useQuery('deals', () => catalog.listDeals());
  const preference = useFoodPreferenceStore((s) => s.preference);
  const { controlsFor, dialog } = useDishCartControls();
  const [selected, setSelected] = useState<OfferListing | null>(null);
  const now = useMemo(() => new Date(), []);

  const listings = result.status === 'success' ? sortOffers(result.data, now) : [];
  const activeCount = listings.filter((l) => offerStatus(l.offer, now) === 'active').length;
  const dealEntries = useMemo(
    () =>
      deals.status === 'success'
        ? sortOpenFirst(
            filterByPreference(deals.data, preference, (d) => d.food.foodType),
            (d) => d.restaurant.isOpen,
          )
        : [],
    [deals, preference],
  );
  useSyncCartAvailability(
    deals.status === 'success' ? deals.data.map((d) => d.restaurant) : undefined,
  );

  const openOffer = (listing: OfferListing) =>
    listing.restaurant
      ? router.push({ pathname: '/restaurants/[id]', params: { id: listing.restaurant.id } })
      : router.push('/restaurants');

  const selectedActive = selected ? offerStatus(selected.offer, now) === 'active' : false;

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="h1" accessibilityRole="header">
          Offers
        </Text>
        {result.status === 'success' && listings.length > 0 && (
          <Text variant="bodySmall" color="textSecondary">
            {activeCount} {activeCount === 1 ? 'offer' : 'offers'} available
          </Text>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={result.isRefreshing || deals.isRefreshing}
            onRefresh={() => {
              result.refetch();
              deals.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {result.status === 'loading' ? (
          <View style={styles.list} accessibilityLabel="Loading offers">
            {[0, 1].map((key) => (
              <Skeleton key={key} height={160} radius="xl" />
            ))}
          </View>
        ) : result.status === 'error' ? (
          <ErrorState message="We couldn't load offers." onRetry={result.refetch} />
        ) : listings.length === 0 ? (
          <EmptyState
            icon="pricetag-outline"
            title="No offers available right now"
            message="New offers from restaurants near you will show up here."
            actionLabel="Browse restaurants"
            onAction={() => router.push('/restaurants')}
          />
        ) : (
          <View style={styles.list}>
            {/* Honest about the prototype: codes are shown, but checkout cannot apply them yet. */}
            <View style={styles.notice}>
              <Icon name="flask-outline" size="sm" color="warning" />
              <Text variant="bodySmall" color="warning" style={styles.flex}>
                Sample offers for this prototype. Codes can’t be applied until checkout and payments
                are connected.
              </Text>
            </View>
            {listings.map((listing, index) => (
              <OfferBanner
                key={listing.offer.id}
                listing={listing}
                index={index}
                status={offerStatus(listing.offer, now)}
                onPress={() => setSelected(listing)}
              />
            ))}
          </View>
        )}

        <View>
          <SectionHeader title="Deals on dishes" subtitle="Lower prices on selected dishes" />
          <FoodPreferenceChips style={styles.chips} />
          {deals.status === 'loading' ? (
            <View style={styles.list}>
              <Skeleton height={240} radius="card" />
            </View>
          ) : deals.status === 'error' ? (
            <ErrorState message="We couldn't load dish deals." onRetry={deals.refetch} />
          ) : dealEntries.length === 0 ? (
            <EmptyState
              icon="restaurant-outline"
              title="No dish deals match"
              message="Try another food preference to see more deals."
            />
          ) : (
            <FoodGrid entries={dealEntries} controlsFor={controlsFor} />
          )}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={selected !== null}
        title={selected?.offer.label ?? ''}
        message={
          selected
            ? offerTerms(selected)
                .map((term) => `• ${term}`)
                .join('\n')
            : ''
        }
        confirmLabel={
          selectedActive
            ? selected?.restaurant
              ? `Order from ${selected.restaurant.name}`
              : 'Browse restaurants'
            : 'OK'
        }
        cancelLabel={selectedActive ? 'Close' : null}
        onCancel={() => setSelected(null)}
        onConfirm={() => {
          const listing = selected;
          setSelected(null);
          if (listing && selectedActive) openOffer(listing);
        }}
      />
      <CartBar bottomInset={false} />
      {dialog}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: screenGutter, paddingTop: spacing.sm, paddingBottom: spacing.md },
  content: { gap: spacing['2xl'], paddingBottom: CART_BAR_SPACE },
  list: { paddingHorizontal: screenGutter, gap: spacing.lg },
  chips: { paddingBottom: spacing.lg },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  flex: { flex: 1 },
});
