import { StyleSheet, View } from 'react-native';

import type { FoodType } from '../shared/types';

import { colors } from '../theme/colors';

const labels: Record<FoodType, string> = {
  veg: 'Vegetarian',
  non_veg: 'Non-vegetarian',
  egg: 'Contains egg',
};

const tint: Record<FoodType, string> = {
  veg: colors.veg,
  non_veg: colors.nonVeg,
  egg: colors.egg,
};

/**
 * Indian food-type mark (square outline with a symbol). Shapes differ — circle for veg,
 * triangle for non-veg and egg — so the mark never relies on colour alone.
 */
export function FoodTypeMark({ type, size = 14 }: { type: FoodType; size?: number }) {
  const color = tint[type];
  const symbol = size * 0.5;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={labels[type]}
      style={[styles.box, { width: size, height: size, borderColor: color }]}
    >
      {type === 'veg' ? (
        <View
          style={{
            width: symbol,
            height: symbol,
            borderRadius: symbol / 2,
            backgroundColor: color,
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
              borderBottomColor: color,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
