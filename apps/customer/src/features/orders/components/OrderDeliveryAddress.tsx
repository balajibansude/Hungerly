import type { OrderSummary } from '@hungerly/types';
import { Card, Icon, spacing, Text } from '@hungerly/ui';
import { StyleSheet, View } from 'react-native';

import { orderDeliveryDisplay } from '../deliveryAddress';

/** "Delivering to" card for a placed order. Renders nothing if the order has no address. */
export function OrderDeliveryAddress({ order }: { order: OrderSummary }) {
  const display = orderDeliveryDisplay(order);
  if (!display) return null;
  return (
    <Card style={styles.card} testID="order-delivery-address">
      {/* One screen-reader stop for the whole address (a plain Card doesn't group its children). */}
      <View accessible accessibilityLabel={display.accessibilityLabel} style={styles.content}>
        <View style={styles.row}>
          <Icon name="location-outline" size="sm" color="primary" />
          <Text variant="label" color="textSecondary">
            Delivering to
          </Text>
        </View>
        <View style={styles.row}>
          <Icon name={display.icon} size="sm" color="textSecondary" />
          <Text variant="h3">{display.title}</Text>
        </View>
        <Text variant="bodySmall" color="textSecondary">
          {display.lines.join(', ')}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg },
  content: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
