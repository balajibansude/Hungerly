import type { Food, Restaurant } from '@hungerly/types';
import { screenGutter, spacing } from '@hungerly/ui';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { DishCartControls } from '../useDishCartControls';
import { FoodCard } from './FoodCard';

export interface DishEntry {
  food: Food;
  restaurant: Restaurant;
}

type ControlsFor = (food: Food, restaurant: Restaurant) => DishCartControls;

const GRID_GAP = spacing.lg;
/** Cards never get narrower than this; very narrow phones fall back to one column. */
const MIN_CARD_WIDTH = 150;
export const FOOD_RAIL_CARD_WIDTH = 176;

/** Width of one card in a two-column grid that spans the screen inside the gutters. */
export function useGridCardWidth(): { width: number; columns: number } {
  const { width } = useWindowDimensions();
  const available = width - screenGutter * 2;
  const twoUp = Math.floor((available - GRID_GAP) / 2);
  return twoUp >= MIN_CARD_WIDTH ? { width: twoUp, columns: 2 } : { width: available, columns: 1 };
}

/** Two-column grid of dish cards (one column on very narrow screens). */
export function FoodGrid({
  entries,
  controlsFor,
  showRestaurant = true,
}: {
  entries: DishEntry[];
  controlsFor: ControlsFor;
  showRestaurant?: boolean;
}) {
  const { width } = useGridCardWidth();
  return (
    <View style={styles.grid}>
      {entries.map(({ food, restaurant }) => (
        <FoodCard
          key={food.id}
          food={food}
          restaurant={restaurant}
          controls={controlsFor(food, restaurant)}
          width={width}
          showRestaurant={showRestaurant}
        />
      ))}
    </View>
  );
}

/** Horizontal rail of dish cards. */
export function FoodRail({
  entries,
  controlsFor,
}: {
  entries: DishEntry[];
  controlsFor: ControlsFor;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {entries.map(({ food, restaurant }) => (
        <FoodCard
          key={food.id}
          food={food}
          restaurant={restaurant}
          controls={controlsFor(food, restaurant)}
          width={FOOD_RAIL_CARD_WIDTH}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: GRID_GAP,
    rowGap: spacing['2xl'],
    paddingHorizontal: screenGutter,
  },
  rail: { paddingHorizontal: screenGutter, gap: spacing.lg },
});
