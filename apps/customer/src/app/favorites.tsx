import { useQuery } from '@hungerly/app-core';
import { EmptyState, ErrorState, Screen, ScreenHeader, screenGutter, spacing } from '@hungerly/ui';
import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { CART_BAR_SPACE, CartBar } from '@/features/cart/components/CartBar';
import { useFavoritesStore } from '@/features/favorites/store';
import { useFavoriteToggle } from '@/features/favorites/useFavoriteToggle';
import { RestaurantCard } from '@/features/restaurants/components/RestaurantCard';
import { RestaurantCardSkeleton } from '@/features/restaurants/components/RestaurantCardSkeleton';
import { useServices } from '@/services';

/** Saved restaurants. Signed-in only (guarded in the root layout). */
export default function FavoritesScreen() {
  const { favorites } = useServices();
  const result = useQuery('favorites', () => favorites.list());
  const savedIds = useFavoritesStore((s) => s.ids);
  const favorite = useFavoriteToggle();

  // Unsaving here hides the card at once, without refetching the list.
  const saved =
    result.status === 'success' ? result.data.filter((r) => savedIds.includes(r.id)) : [];

  return (
    <Screen>
      <ScreenHeader
        title="Favourites"
        subtitle={
          result.status === 'success'
            ? `${saved.length} saved ${saved.length === 1 ? 'restaurant' : 'restaurants'}`
            : undefined
        }
        onBack={() => router.back()}
      />
      {result.status === 'loading' ? (
        <View style={styles.list}>
          <RestaurantCardSkeleton />
        </View>
      ) : result.status === 'error' ? (
        <ErrorState message="We couldn't load your favourites." onRetry={result.refetch} />
      ) : (
        <FlatList
          data={saved}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, styles.listContent]}
          onRefresh={result.refetch}
          refreshing={result.isRefreshing}
          renderItem={({ item }) => (
            <RestaurantCard
              restaurant={item}
              isFavorite={favorite.isFavorite(item.id)}
              onToggleFavorite={() => favorite.toggle(item.id)}
              onPress={() =>
                router.push({ pathname: '/restaurants/[id]', params: { id: item.id } })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="bookmark-outline"
              title="No favourites yet"
              message="Tap the bookmark on any restaurant to save it here."
              actionLabel="Explore restaurants"
              onAction={() => router.push('/restaurants')}
            />
          }
        />
      )}
      <CartBar />
      {favorite.dialog}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: screenGutter, gap: spacing.lg },
  listContent: { flexGrow: 1, paddingTop: spacing.xs, paddingBottom: CART_BAR_SPACE },
});
