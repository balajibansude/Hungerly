import {
  Button,
  Card,
  colors,
  Divider,
  Icon,
  Screen,
  screenGutter,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrderDeliveryAddress } from '@/features/orders/components/OrderDeliveryAddress';
import { OrderNotFound } from '@/features/orders/components/OrderNotFound';
import { orderRoutes } from '@/features/orders/flow';
import { usePlacedOrder } from '@/features/orders/store';

/** Shown right after an order is created. Next: add instructions for that order. */
export default function OrderConfirmationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = usePlacedOrder(id);
  const insets = useSafeAreaInsets();

  if (!order) return <OrderNotFound />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.tick}>
            <Icon name="checkmark" size="lg" color="onPrimary" />
          </View>
          <Text variant="h1" align="center" accessibilityRole="header">
            Order placed!
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            Order #{order.orderNumber} from {order.restaurantName}
          </Text>
        </View>

        <Card style={styles.summary}>
          {order.lines.map((line, index) => (
            <View key={`${line.name}-${index}`} style={styles.line}>
              <Text variant="body" style={styles.flex} numberOfLines={2}>
                {line.quantity} × {line.name}
              </Text>
              <Text variant="body">{formatMoney(line.lineTotal)}</Text>
            </View>
          ))}
          <Divider />
          <View style={styles.line}>
            <Text variant="label" style={styles.flex}>
              Total
            </Text>
            <Text variant="label">{formatMoney(order.total)}</Text>
          </View>
        </Card>

        <OrderDeliveryAddress order={order} />

        <Text variant="bodySmall" color="textSecondary" align="center">
          Next, tell the restaurant and your delivery partner anything they should know.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label="Add instructions"
          icon="arrow-forward"
          iconPosition="end"
          onPress={() => router.replace(orderRoutes.instructions(order.id))}
          fullWidth
          testID="confirmation-continue"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: screenGutter, paddingVertical: spacing['2xl'], gap: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.sm },
  tick: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    marginBottom: spacing.sm,
  },
  summary: { padding: spacing.lg, gap: spacing.md },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  footer: {
    paddingHorizontal: screenGutter,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
