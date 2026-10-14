import { OrderPageSchema, paths } from '@hungerly/api-client';
import {
  Card,
  EmptyState,
  OrderStatusBadge,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { useApiQuery } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { formatDateTime } from '@/features/orders/format';

export default function OrderHistoryScreen() {
  const { branchId } = useActiveBranch();
  const query = useApiQuery(
    branchId ? paths.partner.orders(branchId) : null,
    OrderPageSchema,
    { status: 'history', limit: 50 },
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Order history" />
      <QueryView query={query} loadingLabel="Loading history">
        {(page) => (
          <FlatList
            data={page.items}
            keyExtractor={(o) => o.id}
            contentContainerStyle={styles.content}
            ListEmptyComponent={
              <EmptyState
                icon="receipt-outline"
                title="No past orders"
                message="Completed and cancelled orders appear here."
              />
            }
            renderItem={({ item: order }) => (
              <Card
                onPress={() =>
                  router.push({ pathname: '/orders/[id]', params: { id: order.id } })
                }
                style={styles.card}
              >
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text variant="label">#{order.orderNumber}</Text>
                    <Text variant="caption" color="textSecondary">
                      {formatDateTime(order.placedAt)} · {order.customer.firstName}
                    </Text>
                  </View>
                  <View style={styles.right}>
                    <Text variant="price">{formatMoney(order.bill.total)}</Text>
                    <OrderStatusBadge status={order.status} audience="partner" />
                  </View>
                </View>
              </Card>
            )}
          />
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  card: { padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
  right: { alignItems: 'flex-end', gap: spacing.xs },
});
