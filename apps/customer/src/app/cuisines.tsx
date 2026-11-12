import { useQuery } from '@hungerly/app-core';
import type { Category } from '@hungerly/types';
import {
  EmptyState,
  ErrorState,
  IconButton,
  RemoteImage,
  Screen,
  screenGutter,
  Skeleton,
  spacing,
  Text,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CUISINE_COLUMNS, cuisineGridMetrics } from '@/features/cuisines/grid';
import { cuisineHref } from '@/features/cuisines/href';
import { useServices } from '@/services';

const GAP = spacing.sm;

/** Full list of cuisines in a four-column grid. Opened from the filter icon on Home. */
export default function AllCuisinesScreen() {
  const { catalog } = useServices();
  const { width } = useWindowDimensions();
  const metrics = cuisineGridMetrics({ screenWidth: width, gutter: screenGutter, columnGap: GAP });
  const cuisines = useQuery('cuisines', () => catalog.listCuisines());

  const select = (category: Category) => {
    // Close the sheet first so Back from the results returns to where the customer was.
    router.back();
    router.push(cuisineHref(category));
  };

  return (
    <Screen edges={['top', 'bottom']} background="surface">
      <View style={styles.header}>
        <Text variant="h1" accessibilityRole="header" style={styles.title}>
          All Cuisines
        </Text>
        <IconButton
          icon="close"
          variant="ghost"
          accessibilityLabel="Close all cuisines"
          onPress={() => router.back()}
        />
      </View>

      {cuisines.status === 'loading' ? (
        <View style={[styles.grid, styles.skeleton]} accessibilityLabel="Loading cuisines">
          {Array.from({ length: CUISINE_COLUMNS * 3 }, (_, index) => (
            <View key={index} style={[styles.item, { width: metrics.itemWidth }]}>
              <Skeleton width={metrics.imageSize} height={metrics.imageSize} radius="pill" />
              <Skeleton width={metrics.imageSize * 0.8} height={12} />
            </View>
          ))}
        </View>
      ) : cuisines.status === 'error' ? (
        <ErrorState message="We couldn't load cuisines." onRetry={cuisines.refetch} />
      ) : (
        <FlatList
          data={cuisines.data}
          keyExtractor={(item) => item.id}
          numColumns={CUISINE_COLUMNS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.columns}
          ListEmptyComponent={
            <EmptyState
              icon="restaurant-outline"
              title="No cuisines yet"
              message="Cuisines appear here as restaurants join near you."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => select(item)}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityHint="Shows restaurants for this cuisine"
              style={({ pressed }) => [
                styles.item,
                { width: metrics.itemWidth },
                pressed && styles.pressed,
              ]}
            >
              <RemoteImage
                image={item.image}
                decorative
                radius="pill"
                fallbackIcon="fast-food-outline"
                style={{ width: metrics.imageSize, height: metrics.imageSize }}
              />
              <Text variant="label" align="center" numberOfLines={1} style={styles.name}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: screenGutter,
    paddingRight: screenGutter - spacing.sm,
  },
  title: { flex: 1 },
  grid: {
    paddingHorizontal: screenGutter,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
    rowGap: spacing['2xl'],
  },
  columns: { columnGap: GAP },
  skeleton: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP },
  item: { alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.7 },
  name: { alignSelf: 'stretch' },
});
