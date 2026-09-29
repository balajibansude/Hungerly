import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { colors } from '../theme/colors';
import { hitSlop, motion, radius, spacing } from '../theme/layout';
import { Icon } from './Icon';
import { Text } from './Text';

export interface QuantitySelectorProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  /** Label of the item, used to build accessible labels ("Add Paneer Tikka"). */
  itemName: string;
  /**
   * Lowest allowed quantity. 0 (default): decrementing from 1 removes the item, shown
   * with a bin icon. 1: used where an item cannot be removed (e.g. the dish sheet).
   */
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  /** Shown when quantity is 0. */
  addLabel?: string;
}

/**
 * "Add" pill that turns into a − n + stepper. The count animates so the change is
 * noticeable in a busy list without being distracting.
 */
export function QuantitySelector({
  quantity,
  onIncrement,
  onDecrement,
  itemName,
  min = 0,
  max = 20,
  size = 'md',
  addLabel = 'Add',
}: QuantitySelectorProps) {
  const height = size === 'md' ? 40 : 34;

  if (quantity === 0) {
    return (
      <Pressable
        onPress={onIncrement}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={`${addLabel} ${itemName}`}
        style={({ pressed }) => [styles.add, { height }, pressed && styles.addPressed]}
      >
        <Text variant="button" color="primary">
          {addLabel}
        </Text>
        <Icon name="add" size="sm" color="primary" />
      </Pressable>
    );
  }

  const atMax = quantity >= max;
  const atMin = quantity <= min;
  const removes = min === 0 && quantity === 1;
  return (
    <Animated.View
      layout={LinearTransition.duration(motion.duration.fast)}
      style={[styles.stepper, { height }]}
      accessibilityRole="adjustable"
      accessibilityLabel={`${itemName} quantity`}
      accessibilityValue={{ now: quantity, min, max }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment' && !atMax) onIncrement();
        if (event.nativeEvent.actionName === 'decrement' && !atMin) onDecrement();
      }}
    >
      <Pressable
        onPress={onDecrement}
        disabled={atMin}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={removes ? `Remove ${itemName}` : `Decrease ${itemName}`}
        accessibilityState={{ disabled: atMin }}
        style={[styles.step, atMin && styles.disabledStep]}
      >
        <Icon name={removes ? 'trash-outline' : 'remove'} size="sm" color="onPrimary" />
      </Pressable>
      <View style={styles.countBox}>
        <Animated.View
          key={quantity}
          entering={FadeIn.duration(motion.duration.fast)}
          exiting={FadeOut.duration(80)}
        >
          <Text variant="button" color="onPrimary" style={styles.count}>
            {quantity}
          </Text>
        </Animated.View>
      </View>
      <Pressable
        onPress={onIncrement}
        disabled={atMax}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${itemName}`}
        accessibilityState={{ disabled: atMax }}
        style={[styles.step, atMax && styles.disabledStep]}
      >
        <Icon name="add" size="sm" color="onPrimary" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  add: {
    minWidth: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  addPressed: { backgroundColor: colors.primarySoft },
  stepper: {
    minWidth: 92,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  step: {
    width: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledStep: { opacity: 0.4 },
  countBox: { minWidth: 28, alignItems: 'center' },
  count: { fontVariant: ['tabular-nums'] },
});
