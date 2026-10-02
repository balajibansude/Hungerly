import {
  Chip,
  EmptyState,
  ErrorState,
  FoodTypeMark,
  Price,
  RemoteImage,
  screenGutter,
  SearchBarInput,
  SectionHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RestaurantCard } from '@/features/restaurants/components/RestaurantCard';
import { useQuery } from '@/hooks/useQuery';
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

  const hasQuery = query.length > 0;
  const empty =
    results.status === 'success' &&
    results.data.restaurants.length === 0 &&
    results.data.foods.length === 0;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <Text variant="h1" accessibilityRole="header">
          Search
        </Text>
        <SearchBarInput
          placeholder="Search dishes or restaurants"
          value={text}
          onChangeText={setText}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {!hasQuery ? (
          <View style={styles.section}>
            <Text variant="label" color="textSecondary">
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
            {results.data.foods.length > 0 && (
              <View>
                <SectionHeader title="Dishes" />
                <View style={styles.list}>
                  {results.data.foods.map(({ food, restaurantName }) => (
                    <Pressable
                      key={food.id}
                      onPress={() =>
                        router.push({ pathname: '/food/[id]', params: { id: food.id } })
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${food.name} from ${restaurantName}`}
                      style={({ pressed }) => [styles.dish, pressed && styles.pressed]}
                    >
                      <RemoteImage
                        image={food.image}
                        decorative
                        style={styles.dishImage}
                        radius="md"
                      />
                      <View style={styles.flex}>
                        <View style={styles.dishTitle}>
                          <FoodTypeMark type={food.foodType} />
                          <Text variant="label" numberOfLines={1} style={styles.flex}>
                            {food.name}
                          </Text>
                        </View>
                        <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
                          {restaurantName}
                        </Text>
                        <Price value={food.price} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            {results.data.restaurants.length > 0 && (
              <View>
                <SectionHeader title="Restaurants" />
                <View style={styles.list}>
                  {results.data.restaurants.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: screenGutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  content: { paddingVertical: spacing.lg, gap: spacing['2xl'] },
  section: { paddingHorizontal: screenGutter, gap: spacing.md },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  loader: { marginTop: spacing['3xl'] },
  list: { paddingHorizontal: screenGutter, gap: spacing.md },
  dish: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  pressed: { opacity: 0.7 },
  dishImage: { width: 64, height: 64 },
  dishTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + spacing.xxs },
});
