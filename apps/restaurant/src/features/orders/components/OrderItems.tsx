import type { OrderItem } from '@hungerly/types';
import { Divider, FoodTypeMark, spacing, Text } from '@hungerly/ui';
import { addMoney, formatMoney } from '@hungerly/utils';
import { StyleSheet, View } from 'react-native';

/** Ordered dishes in large type for the kitchen: quantity, options, notes, prices. */
export function OrderItems({ items }: { items: OrderItem[] }) {
  return (
    <View>
      {items.map((item, index) => {
        const each = addMoney(item.unitPrice, item.optionsPrice);
        return (
          <View key={item.id}>
            {index > 0 && <Divider />}
            <View style={styles.item}>
              <Text variant="h3" style={styles.quantity}>
                {item.quantity}×
              </Text>
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <FoodTypeMark type={item.foodType} />
                  <Text variant="h3" style={styles.flex}>
                    {item.name}
                  </Text>
                </View>
                {item.options.map((option) => (
                  <Text
                    key={`${option.groupName}:${option.optionName}`}
                    variant="bodySmall"
                    color="textSecondary"
                  >
                    {option.groupName}: {option.optionName}
                    {option.priceDelta.amountMinor > 0
                      ? ` (+${formatMoney(option.priceDelta)})`
                      : ''}
                  </Text>
                ))}
                {item.notes && (
                  <Text variant="bodySmall" color="onAccentSoft">
                    Note: {item.notes}
                  </Text>
                )}
                <Text variant="metadata" color="textTertiary">
                  {formatMoney(each)} each
                </Text>
              </View>
              <Text variant="price">{formatMoney(item.lineTotal)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  quantity: { minWidth: 32 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
