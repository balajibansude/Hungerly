import { useQuery } from '@hungerly/app-core';
import {
  Chip,
  colors,
  ErrorState,
  screenGutter,
  SearchBarButton,
  SectionHeader,
  Skeleton,
  spacing,
  Text,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessionStore } from '@/features/auth/session';
import { CART_BAR_SPACE, CartBar } from '@/features/cart/components/CartBar';
import { cuisineHref } from '@/features/cuisines/href';
import { useFavoriteToggle } from '@/features/favorites/useFavoriteToggle';
import { sortOpenFirst } from '@/features/food/availability';
import { FOOD_RAIL_CARD_WIDTH, FoodRail } from '@/features/food/components/FoodCollections';
import {
  filterByPreference,
  preferenceLabel,
  useFoodPreferenceStore,
} from '@/features/food/preference';
import { useDishCartControls, useSyncCartAvailability } from '@/features/food/useDishCartControls';
import { CategoryRail } from '@/features/home/components/CategoryRail';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import { PromoCarousel } from '@/features/home/components/PromoCarousel';
import { greetingFor, mealPromptFor } from '@/features/home/greeting';
import { RestaurantCard } from '@/features/restaurants/components/RestaurantCard';
import { quickFilters } from '@/features/restaurants/quickFilters';
import { useRefetchOnFocus } from '@/features/addresses/useRefetchOnFocus';
import { useServices } from '@/services';

export default function HomeScreen() {
  const { catalog, location } = useServices();
  const userName = useSessionStore((s) => s.session?.user.fullName);
  const feed = useQuery('home-feed', () => catalog.getHomeFeed());
  // Location is optional for browsing: if it is unknown the header says so and nothing blocks.
  const address = useQuery('delivery-address', () => location.getDeliveryAddress());
  // Pick up a delivery address chosen on the addresses screen.
  useRefetchOnFocus(address.refetch);
  const favorite = useFavoriteToggle();
  const preference = useFoodPreferenceStore((s) => s.preference);
  const setPreference = useFoodPreferenceStore((s) => s.setPreference);
  const { controlsFor, dialog } = useDishCartControls();

  const now = useMemo(() => new Date(), []);

  const popular = useMemo(
    () =>
      feed.status === 'success'
        ? sortOpenFirst(
            filterByPreference(feed.data.popularFoods, preference, (d) => d.food.foodType),
            (d) => d.restaurant.isOpen,
          )
        : [],
    [feed, preference],
  );
  useSyncCartAvailability(
    feed.status === 'success'
      ? [...feed.data.nearby, ...feed.data.popularFoods.map((d) => d.restaurant)]
      : undefined,
  );

  const openRestaurant = (id: string) =>
    router.push({ pathname: '/restaurants/[id]', params: { id } });

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefreshing}
            onRefresh={feed.refetch}
            tintColor={colors.primary}
          />
        }
      >
        <HomeHeader
          address={address.status === 'success' ? address.data : undefined}
          greeting={greetingFor(now, userName)}
          prompt={mealPromptFor(now)}
        />

        <View style={styles.searchGroup}>
          <View style={styles.gutter}>
            <SearchBarButton
              placeholder="Search dishes or restaurants"
              onPress={() => router.push('/search')}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {quickFilters.map((filter) => (
              <Chip
                key={filter.key}
                label={filter.label}
                icon={filter.icon}
                tint={filter.tint}
                onPress={() =>
                  router.push({ pathname: '/restaurants', params: { filter: filter.key } })
                }
                accessibilityHint="Shows restaurants with this filter"
              />
            ))}
          </ScrollView>
        </View>

        {feed.status === 'error' ? (
          <ErrorState message="We couldn't load restaurants near you." onRetry={feed.refetch} />
        ) : feed.status === 'loading' ? (
          <HomeSkeleton />
        ) : (
          <>
            {feed.data.promotions.length > 0 && (
              <View>
                <SectionHeader
                  title="Special offers"
                  actionLabel="See all"
                  onAction={() => router.navigate('/offers')}
                />
                <PromoCarousel
                  listings={feed.data.promotions}
                  onPress={(listing) =>
                    listing.restaurant
                      ? openRestaurant(listing.restaurant.id)
                      : router.navigate('/offers')
                  }
                />
              </View>
            )}

            <View>
              <SectionHeader title="What's on your mind?" />
              <CategoryRail
                categories={feed.data.categories}
                onSelect={(category) => router.push(cuisineHref(category))}
                onOpenFilters={() => router.push('/cuisines')}
                filterActive={preference !== 'mixed'}
              />
            </View>

            <View>
              <SectionHeader
                title="Popular dishes"
                subtitle={
                  preference === 'mixed'
                    ? 'What your neighbours are ordering'
                    : `Showing ${preferenceLabel(preference)} dishes`
                }
                actionLabel={preference === 'mixed' ? undefined : 'Show all'}
                onAction={() => setPreference('mixed')}
              />
              {popular.length > 0 ? (
                <FoodRail entries={popular} controlsFor={controlsFor} />
              ) : (
                <Text variant="body" color="textSecondary" style={styles.gutter}>
                  No popular {preferenceLabel(preference)} dishes nearby right now.
                </Text>
              )}
            </View>

            <View>
              <SectionHeader
                title="Nearby kitchens"
                subtitle="Closest to your delivery address first"
                actionLabel="See all"
                onAction={() =>
                  router.push({ pathname: '/restaurants', params: { sort: 'distance' } })
                }
              />
              <View style={styles.list}>
                {feed.data.nearby.map((restaurant) => (
                  <RestaurantCard
                    key={restaurant.id}
                    restaurant={restaurant}
                    isFavorite={favorite.isFavorite(restaurant.id)}
                    onToggleFavorite={() => favorite.toggle(restaurant.id)}
                    onPress={() => openRestaurant(restaurant.id)}
                  />
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
      <CartBar bottomInset={false} />
      {favorite.dialog}
      {dialog}
    </SafeAreaView>
  );
}

function HomeSkeleton() {
  return (
    <View style={styles.skeleton}>
      <View style={styles.gutter}>
        <Skeleton height={160} radius="xl" />
      </View>
      <View style={styles.rail}>
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} width={72} height={72} radius="pill" />
        ))}
      </View>
      <View style={styles.rail}>
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} width={FOOD_RAIL_CARD_WIDTH} height={240} radius="card" />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing['2xl'], paddingBottom: CART_BAR_SPACE },
  gutter: { paddingHorizontal: screenGutter },
  searchGroup: { gap: spacing.md },
  chips: { paddingHorizontal: screenGutter, gap: spacing.sm },
  rail: { flexDirection: 'row', paddingHorizontal: screenGutter, gap: spacing.md },
  list: { paddingHorizontal: screenGutter, gap: spacing.lg },
  skeleton: { gap: spacing['2xl'], overflow: 'hidden' },
});
