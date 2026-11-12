import { useQuery } from '@hungerly/app-core';
import {
  Chip,
  EmptyState,
  ErrorState,
  Screen,
  ScreenHeader,
  screenGutter,
  spacing,
  Text,
} from '@hungerly/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { CART_BAR_SPACE, CartBar } from '@/features/cart/components/CartBar';
import { useFavoriteToggle } from '@/features/favorites/useFavoriteToggle';
import { RestaurantCard } from '@/features/restaurants/components/RestaurantCard';
import { RestaurantCardSkeleton } from '@/features/restaurants/components/RestaurantCardSkeleton';
import {
  isQuickFilterKey,
  queryFromFilters,
  quickFilters,
  type QuickFilterKey,
} from '@/features/restaurants/quickFilters';
import { useServices, type RestaurantSort } from '@/services';

const sorts: { key: RestaurantSort; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'rating', label: 'Rating' },
  { key: 'delivery_time', label: 'Fastest' },
  { key: 'distance', label: 'Nearest' },
];

const isSort = (value: string | undefined): value is RestaurantSort =>
  sorts.some((s) => s.key === value);

export default function RestaurantListScreen() {
  const params = useLocalSearchParams<{ filter?: string; cuisine?: string; sort?: string }>();
  const { restaurants } = useServices();
  const [active, setActive] = useState<QuickFilterKey[]>(
    params.filter && isQuickFilterKey(params.filter) ? [params.filter] : [],
  );
  const [sort, setSort] = useState<RestaurantSort>(isSort(params.sort) ? params.sort : 'relevance');
  const cuisine = params.cuisine;

  const query = useMemo(
    () => ({ ...queryFromFilters(active), cuisine, sort, limit: 50 }),
    [active, cuisine, sort],
  );
  const result = useQuery(`restaurants:${JSON.stringify(query)}`, () => restaurants.list(query));
  const favorite = useFavoriteToggle();

  const toggle = (key: QuickFilterKey) =>
    setActive((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  const count = result.status === 'success' ? result.data.items.length : undefined;

  return (
    <Screen>
      <ScreenHeader
        title={cuisine ?? 'All restaurants'}
        subtitle={
          count === undefined
            ? 'Finding restaurants…'
            : `${count} ${count === 1 ? 'place' : 'places'} deliver to you`
        }
        onBack={() => router.back()}
      />

      <View style={styles.controls}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {quickFilters.map((filter) => (
            <Chip
              key={filter.key}
              label={filter.label}
              icon={filter.icon}
              tint={filter.tint}
              selected={active.includes(filter.key)}
              onPress={() => toggle(filter.key)}
            />
          ))}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Text variant="label" color="textSecondary" style={styles.sortLabel}>
            Sort
          </Text>
          {sorts.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              selected={sort === option.key}
              onPress={() => setSort(option.key)}
            />
          ))}
        </ScrollView>
      </View>

      {result.status === 'loading' ? (
        <View style={styles.list}>
          <RestaurantCardSkeleton />
          <RestaurantCardSkeleton />
        </View>
      ) : result.status === 'error' ? (
        <ErrorState onRetry={result.refetch} />
      ) : (
        <FlatList
          data={result.data.items}
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
              icon="funnel-outline"
              title="No matches"
              message="No restaurants match these filters right now. Try removing one."
              actionLabel={active.length > 0 ? 'Clear filters' : undefined}
              onAction={active.length > 0 ? () => setActive([]) : undefined}
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
  controls: { gap: spacing.sm, paddingBottom: spacing.md },
  chipRow: { paddingHorizontal: screenGutter, gap: spacing.sm, alignItems: 'center' },
  sortLabel: { marginRight: spacing.xs },
  list: { paddingHorizontal: screenGutter, gap: spacing.lg },
  listContent: { paddingTop: spacing.xs, paddingBottom: CART_BAR_SPACE },
});
