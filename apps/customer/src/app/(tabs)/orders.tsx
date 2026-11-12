import { useQuery } from '@hungerly/app-core';
import { EmptyState, ErrorState, LoadingState, screenGutter, spacing, Text } from '@hungerly/ui';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessionStore } from '@/features/auth/session';
import { useServices } from '@/services';

/** Order history. Ordering is not built yet, so the list is always empty in this phase. */
export default function OrdersScreen() {
  const isSignedIn = useSessionStore((s) => s.session !== null);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <Text variant="h1" accessibilityRole="header">
          Orders
        </Text>
      </View>
      {isSignedIn ? (
        <OrderHistory />
      ) : (
        <EmptyState
          icon="receipt-outline"
          title="Log in to see your orders"
          message="Your order history and tracking are linked to your account. Browsing doesn't need one."
          actionLabel="Log in or sign up"
          onAction={() => router.push({ pathname: '/login', params: { reason: 'orders' } })}
        />
      )}
    </SafeAreaView>
  );
}

/** Only mounted for signed-in customers, so guests never request account data. */
function OrderHistory() {
  const { orders } = useServices();
  const result = useQuery('orders', () => orders.listOrders());

  if (result.status === 'loading') return <LoadingState label="Loading your orders" />;
  if (result.status === 'error') return <ErrorState onRetry={result.refetch} />;
  return (
    <EmptyState
      icon="receipt-outline"
      title="No orders yet"
      message="When you place an order, you can track it and reorder from here."
      actionLabel="Find something to eat"
      onAction={() => router.navigate('/home')}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: screenGutter, paddingTop: spacing.sm, paddingBottom: spacing.md },
});
