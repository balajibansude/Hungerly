import { StyleSheet, View } from 'react-native';

import type { FoodType } from '@hungerly/types';

import { colors } from '../theme/colors';
import { foodTypeStyles } from '../theme/foodType';
import { spacing } from '../theme/layout';
import { Text } from './Text';

export interface FoodTypeMarkProps {
  type: FoodType;
  size?: number;
  /** Shows the short word next to marks that have one ("JAIN"). Defaults to true. */
  showLabel?: boolean;
}

/**
 * Indian food-type mark (square outline with a symbol). Shapes differ — circle for veg and
 * Jain, triangle for non-veg and egg — and Jain adds a word, so the mark never relies on
 * colour alone.
 */
export function FoodTypeMark({ type, size = 14, showLabel = true }: FoodTypeMarkProps) {
  const style = foodTypeStyles[type];
  const symbol = size * 0.5;
  const box = (
    <View style={[styles.box, { width: size, height: size, borderColor: style.color }]}>
      {style.symbol === 'circle' ? (
        <View
          style={{
            width: symbol,
            height: symbol,
            borderRadius: symbol / 2,
            backgroundColor: style.color,
          }}
        />
      ) : (
        <View
          style={[
            styles.triangle,
            {
              borderLeftWidth: symbol / 2,
              borderRightWidth: symbol / 2,
              borderBottomWidth: symbol * 0.9,
              borderBottomColor: style.color,
            },
          ]}
        />
      )}
    </View>
  );

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={style.label} style={styles.row}>
      {box}
      {showLabel && style.shortLabel && (
        <Text variant="caption" style={[styles.word, { color: style.ink }]}>
          {style.shortLabel}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs + 1 },
  box: {
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  triangle: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  word: { fontSize: 10, lineHeight: 12, letterSpacing: 0.4 },
});
