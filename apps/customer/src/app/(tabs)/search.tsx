import { useQuery } from '@hungerly/app-core';
import {
  Chip,
  colors,
  EmptyState,
  ErrorState,
  screenGutter,
  SearchBarInput,
  SectionHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CART_BAR_SPACE, CartBar } from '@/features/cart/components/CartBar';
import { useFavoriteToggle } from '@/features/favorites/useFavoriteToggle';
import { sortOpenFirst } from '@/features/food/availability';
import { FoodGrid } from '@/features/food/components/FoodCollections';
import { FoodPreferenceChips } from '@/features/food/components/FoodPreference';
import {
  filterByPreference,
  preferenceLabel,
  useFoodPreferenceStore,
} from '@/features/food/preference';
import { useDishCartControls, useSyncCartAvailability } from '@/features/food/useDishCartControls';
import { RestaurantCard } from '@/features/restaurants/components/RestaurantCard';
import { useServices } from '@/services';

const SUGGESTIONS = ['Biryani', 'Dosa', 'Pizza', 'Paneer', 'Burger', 'Chai'];
const DEBOUNCE_MS = 300;

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function SearchScreen() {
  const { catalog } = useServices();
  const [text, setText] = useState('');
  const query = useDebounced(text.trim(), DEBOUNCE_MS);
  const results = useQuery(`search:${query}`, () => catalog.search(query));
  const favorite = useFavoriteToggle();
  const preference = useFoodPreferenceStore((s) => s.preference);
  const { controlsFor, dialog } = useDishCartControls();

  const foods =
    results.status === 'success'
      ? sortOpenFirst(
          filterByPreference(results.data.foods, preference, (d) => d.food.foodType),
          (d) => d.restaurant.isOpen,
        )
      : [];
  useSyncCartAvailability(
    results.status === 'success' ? results.data.foods.map((d) => d.restaurant) : undefined,
  );
  const hiddenByPreference =
    results.status === 'success' ? results.data.foods.length - foods.length : 0;

  const hasQuery = query.length > 0;
  const empty =
    results.status === 'success' &&
    results.data.restaurants.length === 0 &&
    results.data.foods.length === 0;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.gutter}>
          <Text variant="h1" accessibilityRole="header">
            Search
          </Text>
          <SearchBarInput
            placeholder="Search dishes or restaurants"
            value={text}
            onChangeText={setText}
          />
        </View>
        <FoodPreferenceChips />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {!hasQuery ? (
          <View style={styles.section}>
            <Text variant="h3" accessibilityRole="header">
              Popular searches
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <Chip
                  key={suggestion}
                  label={suggestion}
                  icon="trending-up"
                  onPress={() => setText(suggestion)}
                />
              ))}
            </View>
          </View>
        ) : results.status === 'loading' ? (
          <ActivityIndicator style={styles.loader} accessibilityLabel="Searching" />
        ) : results.status === 'error' ? (
          <ErrorState onRetry={results.refetch} />
        ) : empty ? (
          <EmptyState
            icon="search-outline"
            title={`No results for “${query}”`}
            message="Try a dish name like “dosa” or a cuisine like “Chinese”."
          />
        ) : (
          <>
            {foods.length > 0 && (
              <View>
                <SectionHeader title="Dishes" />
                <FoodGrid entries={foods} controlsFor={controlsFor} />
              </View>
            )}
            {hiddenByPreference > 0 && (
              <Text variant="bodySmall" color="textSecondary" style={styles.note}>
                {hiddenByPreference} {hiddenByPreference === 1 ? 'dish is' : 'dishes are'} hidden by
                your {preferenceLabel(preference)} preference.
              </Text>
            )}
            {results.data.restaurants.length > 0 && (
              <View>
                <SectionHeader title="Restaurants" />
                <View style={styles.list}>
                  {results.data.restaurants.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      isFavorite={favorite.isFavorite(restaurant.id)}
                      onToggleFavorite={() => favorite.toggle(restaurant.id)}
                      onPress={() =>
                        router.push({
                          pathname: '/restaurants/[id]',
                          params: { id: restaurant.id },
                        })
                      }
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
      <CartBar bottomInset={false} />
      {favorite.dialog}
      {dialog}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  note: { paddingHorizontal: screenGutter },
  flex: { flex: 1 },
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  gutter: { paddingHorizontal: screenGutter, gap: spacing.md },
  content: { paddingTop: spacing.xl, paddingBottom: CART_BAR_SPACE, gap: spacing['2xl'] },
  section: { paddingHorizontal: screenGutter, gap: spacing.md },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  loader: { marginTop: spacing['3xl'] },
  list: { paddingHorizontal: screenGutter, gap: spacing.md },
});
