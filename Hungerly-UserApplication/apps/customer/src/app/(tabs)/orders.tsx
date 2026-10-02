import { EmptyState, ErrorState, LoadingState, screenGutter, spacing, Text } from '@hungerly/ui';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useQuery } from '@/hooks/useQuery';
import { useServices } from '@/services';

/** Order history. Ordering is not built yet, so the list is always empty in this phase. */
export default function OrdersScreen() {
  const { orders } = useServices();
  const result = useQuery('orders', () => orders.listOrders());

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <Text variant="h1" accessibilityRole="header">
          Orders
        </Text>
      </View>
      {result.status === 'loading' ? (
        <LoadingState label="Loading your orders" />
      ) : result.status === 'error' ? (
        <ErrorState onRetry={result.refetch} />
      ) : (
        <EmptyState
          icon="receipt-outline"
          title="No orders yet"
          message="When you place an order, you can track it and reorder from here."
          actionLabel="Find something to eat"
          onAction={() => router.navigate('/home')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: screenGutter, paddingTop: spacing.sm, paddingBottom: spacing.md },
});
