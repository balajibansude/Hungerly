import { EmptyState, Screen } from '@hungerly/ui';
import { router } from 'expo-router';

/** For order screens opened with an unknown id (e.g. an old link after an app restart). */
export function OrderNotFound() {
  return (
    <Screen>
      <EmptyState
        icon="receipt-outline"
        title="Order not found"
        message="We couldn't find this order. You can see your orders in the Orders tab."
        actionLabel="Go to orders"
        onAction={() => router.replace('/orders')}
      />
    </Screen>
  );
}
