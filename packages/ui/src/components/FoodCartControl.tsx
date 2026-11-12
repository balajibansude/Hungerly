import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import type { FoodType } from '@hungerly/types';

import { colors } from '../theme/colors';
import { foodTypeStyles } from '../theme/foodType';
import { hitSlop, motion, radius, spacing } from '../theme/layout';
import { Icon } from './Icon';
import { Text } from './Text';

/** Diameter of the round add button on food cards. */
export const FOOD_ADD_BUTTON_SIZE = 48;
const STEPPER_HEIGHT = 40;

export interface FoodCartControlProps {
  foodType: FoodType;
  /** Total quantity of this dish in the cart. */
  quantity: number;
  /**
   * When true (restaurant closed, dish unavailable) nothing can be added: the control
   * turns grey and pressing it calls `onBlockedPress` to explain why. Removing items that
   * are already in the cart stays possible.
   */
  blocked?: boolean;
  /** Short reason, read by screen readers, e.g. "Restaurant closed, opens at 11:00 AM". */
  blockedReason?: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onBlockedPress?: () => void;
  itemName: string;
  max?: number;
}

/**
 * The add-to-cart control for dish cards: a round plus in the dish's food-type colour,
 * which becomes a compact − n + stepper once the dish is in the cart.
 */
export function FoodCartControl({
  foodType,
  quantity,
  blocked = false,
  blockedReason,
  onIncrement,
  onDecrement,
  onBlockedPress,
  itemName,
  max = 20,
}: FoodCartControlProps) {
  const ink = blocked ? colors.onDisabled : foodTypeStyles[foodType].ink;

  if (quantity <= 0) {
    return (
      <Pressable
        onPress={blocked ? onBlockedPress : onIncrement}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={blocked ? `${itemName} can't be added` : `Add ${itemName} to cart`}
        accessibilityHint={blocked ? blockedReason : undefined}
        accessibilityState={{ disabled: blocked }}
        testID="food-add-button"
        style={({ pressed }) => [
          styles.add,
          { borderColor: ink },
          blocked && styles.addBlocked,
          pressed && !blocked && styles.addPressed,
        ]}
      >
        <Icon name="add" size="lg" tint={ink} />
      </Pressable>
    );
  }

  const atMax = quantity >= max;
  const plusDisabled = blocked || atMax;
  return (
    <Animated.View
      entering={ZoomIn.duration(motion.duration.fast)}
      style={[styles.stepper, { borderColor: ink }]}
      accessibilityRole="adjustable"
      accessibilityLabel={`${itemName} quantity`}
      accessibilityValue={{ now: quantity, min: 0, max }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') {
          if (blocked) onBlockedPress?.();
          else if (!atMax) onIncrement();
        }
        if (event.nativeEvent.actionName === 'decrement') onDecrement();
      }}
      testID="food-stepper"
    >
      <Pressable
        onPress={onDecrement}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={quantity === 1 ? `Remove ${itemName}` : `Decrease ${itemName}`}
        style={styles.step}
        testID="food-stepper-decrement"
      >
        <Icon name="remove" size="md" tint={foodTypeStyles[foodType].ink} />
      </Pressable>
      <View style={styles.countBox}>
        <Animated.View
          key={quantity}
          entering={FadeIn.duration(motion.duration.fast)}
          exiting={FadeOut.duration(80)}
        >
          <Text variant="button" style={[styles.count, { color: foodTypeStyles[foodType].ink }]}>
            {quantity}
          </Text>
        </Animated.View>
      </View>
      <Pressable
        onPress={blocked ? onBlockedPress : onIncrement}
        disabled={!blocked && atMax}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${itemName}`}
        accessibilityHint={blocked ? blockedReason : undefined}
        accessibilityState={{ disabled: plusDisabled }}
        style={[styles.step, plusDisabled && styles.stepDisabled]}
        testID="food-stepper-increment"
      >
        <Icon name="add" size="md" tint={plusDisabled ? colors.onDisabled : ink} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  add: {
    width: FOOD_ADD_BUTTON_SIZE,
    height: FOOD_ADD_BUTTON_SIZE,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    shadowColor: colors.secondary,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  addPressed: { backgroundColor: colors.surfacePressed },
  addBlocked: { backgroundColor: colors.surfacePressed },
  stepper: {
    height: STEPPER_HEIGHT,
    minWidth: 104,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    backgroundColor: colors.surface,
    shadowColor: colors.secondary,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  step: {
    width: 34,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDisabled: { opacity: 0.6 },
  countBox: { flex: 1, minWidth: 24, alignItems: 'center', paddingHorizontal: spacing.xxs },
  count: { fontVariant: ['tabular-nums'] },
});
