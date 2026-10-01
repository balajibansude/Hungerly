import type { PartnerOrder } from '@hungerly/types';
import { Badge, Card, colors, Icon, OrderStatusBadge, Skeleton, spacing, Text } from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { StyleSheet, View } from 'react-native';

import { itemCount } from '../board';
import { cancellationLabel, formatAgo, formatClock, kitchenTiming } from '../format';

export interface OrderCardProps {
  order: PartnerOrder;
  now: Date;
  onPress: () => void;
}

/** One order on the board: who, what, how much, and how long it has been waiting. */
export function OrderCard({ order, now, onPress }: OrderCardProps) {
  const isNew = order.status === 'placed';
  const count = itemCount(order);
  const timing = kitchenTiming(order, now);
  const preview = order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ');

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${isNew ? 'New order' : 'Order'} ${order.orderNumber} from ${order.customer.firstName}, ${count} ${count === 1 ? 'item' : 'items'}, ${formatMoney(order.bill.total)}`}
      accessibilityHint="Opens the order"
      style={[styles.card, isNew && styles.newCard]}
    >
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text variant="h3" numberOfLines={1}>
            #{order.orderNumber}
          </Text>
          <Text variant="metadata" color="textSecondary">
            {formatClock(order.placedAt)} · {formatAgo(order.placedAt, now)}
          </Text>
        </View>
        <OrderStatusBadge status={order.status} audience="partner" />
      </View>

      <View style={styles.line}>
        <Icon name="person-outline" size="sm" color="textSecondary" />
        <Text variant="body" style={styles.flex} numberOfLines={1}>
          {order.customer.firstName}
        </Text>
        <Text variant="price">{formatMoney(order.bill.total)}</Text>
      </View>

      <Text variant="bodySmall" color="textSecondary" numberOfLines={2}>
        {count} {count === 1 ? 'item' : 'items'} · {preview}
      </Text>

      {order.status === 'cancelled' ? (
        <Text variant="bodySmall" color="error">
          {cancellationLabel(order)}
        </Text>
      ) : (
        timing && <Badge label={timing.label} tone={timing.tone} icon="time-outline" />
      )}
    </Card>
  );
}

export function OrderCardSkeleton() {
  return (
    <Card style={styles.card}>
      <Skeleton height={22} width="45%" />
      <Skeleton height={16} width="70%" />
      <Skeleton height={14} width="90%" />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { padding: spacing.lg, gap: spacing.sm },
  newCard: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
