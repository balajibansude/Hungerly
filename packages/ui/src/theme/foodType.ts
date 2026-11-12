import type { FoodType } from '@hungerly/types';

import { colors } from './colors';

export interface FoodTypeStyle {
  /** Spoken label for the mark. */
  label: string;
  /** Short visible label where a word helps (only Jain uses one). */
  shortLabel?: string;
  /** Marker shape inside the square outline. */
  symbol: 'circle' | 'triangle';
  /** Marker colour (outline and symbol). */
  color: string;
  /**
   * Colour for icons and text drawn on white in this food type (add button, stepper).
   * Equals `color` except where the marker colour is too light to read (Jain yellow).
   */
  ink: string;
}

/**
 * The single mapping from food type to its visual language. The food-type mark, the add
 * button and the quantity stepper all read from here, so the classification looks the
 * same on every screen.
 */
export const foodTypeStyles: Record<FoodType, FoodTypeStyle> = {
  veg: { label: 'Vegetarian', symbol: 'circle', color: colors.veg, ink: colors.veg },
  non_veg: {
    label: 'Non-vegetarian',
    symbol: 'triangle',
    color: colors.nonVeg,
    ink: colors.nonVeg,
  },
  egg: { label: 'Contains egg', symbol: 'triangle', color: colors.egg, ink: colors.egg },
  jain: {
    label: 'Jain',
    shortLabel: 'JAIN',
    symbol: 'circle',
    color: colors.jain,
    ink: colors.jainInk,
  },
};
