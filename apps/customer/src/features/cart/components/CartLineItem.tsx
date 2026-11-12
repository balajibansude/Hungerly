import type { CartItem } from '@hungerly/types';
import { FoodTypeMark, Price, QuantitySelector, spacing, Text } from '@hungerly/ui';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import { MAX_LINE_QUANTITY } from '../store';
import { lineTotal } from '../pricing';

export function CartLineItem({
  item,
  onIncrement,
  onDecrement,
  canIncrease = true,
}: {
  item: CartItem;
  /** False while the restaurant is closed: the + is disabled, removing still works. */
  canIncrease?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const options = item.selectedOptions.map((o) => o.optionName).join(', ');
  return (
    <Animated.View layout={LinearTransition} exiting={FadeOut.duration(150)} style={styles.row}>
      <View style={styles.mark}>
        <FoodTypeMark type={item.foodType} />
      </View>
      <View style={styles.details}>
        <Text variant="label" numberOfLines={2}>
          {item.name}
        </Text>
        {options.length > 0 && (
          <Text variant="bodySmall" color="textSecondary" numberOfLines={2}>
            {options}
          </Text>
        )}
      </View>
      <View style={styles.right}>
        <QuantitySelector
          quantity={item.quantity}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          itemName={item.name}
          max={canIncrease ? MAX_LINE_QUANTITY : item.quantity}
          size="sm"
        />
        <Price value={lineTotal(item)} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  mark: { paddingTop: spacing.xxs + 1 },
  details: { flex: 1, gap: spacing.xxs },
  right: { alignItems: 'flex-end', gap: spacing.sm },
});
