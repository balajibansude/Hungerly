import {
  Button,
  Card,
  Divider,
  OrderStatusBadge,
  Screen,
  ScreenHeader,
  screenGutter,
  spacing,
  Text,
} from '@hungerly/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  describeSection,
  useOrderInstructions,
  type InstructionSectionId,
} from '@/features/instructions/store';
import { OrderDeliveryAddress } from '@/features/orders/components/OrderDeliveryAddress';
import { OrderNotFound } from '@/features/orders/components/OrderNotFound';
import { usePlacedOrder } from '@/features/orders/store';

const SECTION_TITLES: Record<InstructionSectionId, string> = {
  restaurant: 'For the restaurant',
  delivery: 'For your delivery partner',
};

/**
 * Order tracking. Live status updates are not built yet, so this shows the order's current
 * status and the instructions saved against it.
 */
export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = usePlacedOrder(id);
  const draft = useOrderInstructions(id ?? '');

  if (!order) return <OrderNotFound />;

  const goHome = () => router.replace('/home');
  // Show only what the order actually has: saved instructions, not unsent edits.
  const saved = draft.savedAt !== null;

  return (
    <Screen>
      <ScreenHeader title="Track order" subtitle={`Order #${order.orderNumber}`} onBack={goHome} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text variant="h3" style={styles.flex}>
              {order.restaurantName}
            </Text>
            <OrderStatusBadge status={order.status} />
          </View>
          <Text variant="bodySmall" color="textSecondary">
            Live tracking is coming soon. We&apos;ll show your order&apos;s progress here.
          </Text>
        </Card>

        <OrderDeliveryAddress order={order} />

        <Card style={styles.card} testID="tracking-instructions">
          <Text variant="h3" accessibilityRole="header">
            Your instructions
          </Text>
          {(['restaurant', 'delivery'] as const).map((section, index) => {
            const lines = saved ? describeSection(section, draft[section]) : [];
            return (
              <View key={section} style={styles.section}>
                {index > 0 && <Divider />}
                <Text variant="label">{SECTION_TITLES[section]}</Text>
                <Text variant="bodySmall" color="textSecondary">
                  {lines.length > 0 ? lines.join(' · ') : 'No instructions'}
                </Text>
              </View>
            );
          })}
        </Card>

        <Button label="Back to home" variant="outline" onPress={goHome} fullWidth />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing['2xl'], gap: spacing.lg },
  card: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  section: { gap: spacing.xs },
});
