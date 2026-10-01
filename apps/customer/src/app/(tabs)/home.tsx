import { useQuery } from '@hungerly/app-core';
import {
  Chip,
  ErrorState,
  screenGutter,
  SearchBarButton,
  SectionHeader,
  Skeleton,
  spacing,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessionStore } from '@/features/auth/session';
import { CART_BAR_SPACE, CartBar } from '@/features/cart/components/CartBar';
import { CategoryRail } from '@/features/home/components/CategoryRail';
import { HomeHeader } from '@/features/home/components/HomeHeader';
import {
  POPULAR_FOOD_CARD_WIDTH,
  PopularFoodCard,
} from '@/features/home/components/PopularFoodCard';
import { PromoCarousel } from '@/features/home/components/PromoCarousel';
import { greetingFor, mealPromptFor } from '@/features/home/greeting';
import { RestaurantCard } from '@/features/restaurants/components/RestaurantCard';
import { RestaurantCardSkeleton } from '@/features/restaurants/components/RestaurantCardSkeleton';
import { quickFilters } from '@/features/restaurants/quickFilters';
import { useServices } from '@/services';

export default function HomeScreen() {
  const { catalog, location } = useServices();
  const { width } = useWindowDimensions();
  const userName = useSessionStore((s) => s.session?.user.fullName);
  const feed = useQuery('home-feed', () => catalog.getHomeFeed());
  const address = useQuery('delivery-address', () => location.getDeliveryAddress());

  const now = useMemo(() => new Date(), []);
  // Featured cards peek at the next card, signalling the row scrolls horizontally.
  const featuredWidth = Math.min(width * 0.78, 340);

  const openRestaurant = (id: string) =>
    router.push({ pathname: '/restaurants/[id]', params: { id } });

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={feed.isRefreshing} onRefresh={feed.refetch} />}
      >
        <HomeHeader
          address={address.status === 'success' ? address.data : undefined}
          greeting={greetingFor(now, userName)}
          prompt={mealPromptFor(now)}
        />

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
              onPress={() =>
                router.push({ pathname: '/restaurants', params: { filter: filter.key } })
              }
              accessibilityHint="Shows restaurants with this filter"
            />
          ))}
        </ScrollView>

        {feed.status === 'error' ? (
          <ErrorState message="We couldn't load restaurants near you." onRetry={feed.refetch} />
        ) : feed.status === 'loading' ? (
          <HomeSkeleton featuredWidth={featuredWidth} />
        ) : (
          <>
            <View>
              <SectionHeader title="What's on your mind?" />
              <CategoryRail
                categories={feed.data.categories}
                onSelect={(category) =>
                  router.push({ pathname: '/restaurants', params: { cuisine: category.name } })
                }
              />
            </View>

            <PromoCarousel
              offers={feed.data.promotions}
              onPress={(offer) =>
                offer.restaurantId
                  ? openRestaurant(offer.restaurantId)
                  : router.push('/restaurants')
              }
            />

            <View>
              <SectionHeader title="Loved in your area" subtitle="Top-rated and open now" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {feed.data.featured.map((restaurant) => (
                  <RestaurantCard
                    key={restaurant.id}
                    restaurant={restaurant}
                    variant="featured"
                    width={featuredWidth}
                    onPress={() => openRestaurant(restaurant.id)}
                  />
                ))}
              </ScrollView>
            </View>

            <View>
              <SectionHeader title="Popular dishes" subtitle="What your neighbours are ordering" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {feed.data.popularFoods.map(({ food, restaurantName }) => (
                  <PopularFoodCard
                    key={food.id}
                    food={food}
                    restaurantName={restaurantName}
                    onPress={() => router.push({ pathname: '/food/[id]', params: { id: food.id } })}
                  />
                ))}
              </ScrollView>
            </View>

            <View>
              <SectionHeader
                title="Nearby"
                subtitle="Closest kitchens first"
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
                    onPress={() => openRestaurant(restaurant.id)}
                  />
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
      <CartBar bottomInset={false} />
    </SafeAreaView>
  );
}

function HomeSkeleton({ featuredWidth }: { featuredWidth: number }) {
  return (
    <View style={styles.skeleton}>
      <View style={styles.rail}>
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} width={72} height={72} radius="pill" />
        ))}
      </View>
      <View style={styles.gutter}>
        <Skeleton height={132} radius="card" />
      </View>
      <View style={styles.rail}>
        <RestaurantCardSkeleton width={featuredWidth} imageHeight={168} />
        <RestaurantCardSkeleton width={POPULAR_FOOD_CARD_WIDTH} imageHeight={168} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing['2xl'], paddingBottom: CART_BAR_SPACE },
  gutter: { paddingHorizontal: screenGutter },
  chips: { paddingHorizontal: screenGutter, gap: spacing.sm, marginTop: -spacing.sm },
  rail: { flexDirection: 'row', paddingHorizontal: screenGutter, gap: spacing.md },
  list: { paddingHorizontal: screenGutter, gap: spacing.lg },
  skeleton: { gap: spacing['2xl'], overflow: 'hidden' },
});
