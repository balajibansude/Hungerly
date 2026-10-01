import type { PartnerOrder } from '@hungerly/types';
import {
  Chip,
  colors,
  EmptyState,
  ErrorState,
  Screen,
  screenGutter,
  spacing,
  type IconName,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { BOARD_GROUPS, groupOrders, type BoardGroup } from '@/features/orders/board';
import { OrderCard, OrderCardSkeleton } from '@/features/orders/components/OrderCard';
import { useNow, useOrderBoard } from '@/features/orders/useOrderBoard';
import { useActiveRestaurant } from '@/features/restaurant/useActiveRestaurant';
import { TabHeader } from '@/features/shell/TabHeader';

/** Two columns of cards on tablets (counter screens), one on phones. */
const TABLET_MIN_WIDTH = 768;

const EMPTY: Record<BoardGroup, { icon: IconName; title: string; message: string }> = {
  new: {
    icon: 'notifications-outline',
    title: 'No new orders',
    message: 'New orders appear here. Pull down to check again.',
  },
  preparing: {
    icon: 'flame-outline',
    title: 'Nothing cooking',
    message: 'Orders you accept move here until you mark them ready.',
  },
  ready: {
    icon: 'bag-check-outline',
    title: 'Nothing waiting for pickup',
    message: 'Orders marked ready wait here for the rider.',
  },
  completed: {
    icon: 'checkmark-done-outline',
    title: 'No completed orders yet',
    message: 'Orders picked up by riders are listed here.',
  },
  cancelled: {
    icon: 'close-circle-outline',
    title: 'No cancelled orders',
    message: 'Rejected and cancelled orders are listed here.',
  },
};

/** R8 — live order board: New · Preparing · Ready for pickup · Completed · Cancelled. */
export default function OrdersScreen() {
  const { orders, load, refreshing, refresh, retry } = useOrderBoard();
  const restaurant = useActiveRestaurant();
  const now = useNow();
  const { width } = useWindowDimensions();
  const columns = width >= TABLET_MIN_WIDTH ? 2 : 1;
  const [group, setGroup] = useState<BoardGroup>('new');

  const groups = useMemo(() => groupOrders(orders), [orders]);
  const visible = groups[group];
  const inReview = restaurant.status === 'success' && restaurant.data.status === 'pending_review';

  const openOrder = (order: PartnerOrder) =>
    router.push({ pathname: '/orders/[id]', params: { id: order.id } });

  return (
    <Screen edges={['top']}>
      <TabHeader title="Orders" />
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.groups}
        >
          {BOARD_GROUPS.map(({ key, label }) => (
            <Chip
              key={key}
              label={load.status === 'ready' ? `${label} ${groups[key].length}` : label}
              selected={group === key}
              onPress={() => setGroup(key)}
            />
          ))}
        </ScrollView>
      </View>

      {load.status === 'idle' || load.status === 'loading' ? (
        <View style={styles.list} accessibilityLabel="Loading orders" accessible>
          {[0, 1, 2].map((i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </View>
      ) : load.status === 'error' ? (
        <ErrorState title="Couldn’t load orders" message={load.message} onRetry={retry} />
      ) : (
        <FlatList
          key={`columns-${columns}`}
          data={visible}
          keyExtractor={(order) => order.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? styles.row : undefined}
          contentContainerStyle={[styles.list, visible.length === 0 && styles.emptyList]}
          renderItem={({ item }) => (
            <View style={columns > 1 ? styles.cell : undefined}>
              <OrderCard order={item} now={now} onPress={() => openOrder(item)} />
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            inReview && orders.length === 0 ? (
              <EmptyState
                icon="time-outline"
                title="Orders start after approval"
                message="Your restaurant is in review. Once Hungerly approves it and you go online, new orders appear here."
              />
            ) : (
              <EmptyState {...EMPTY[group]} />
            )
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  groups: { gap: spacing.sm, paddingHorizontal: screenGutter, paddingBottom: spacing.md },
  list: { gap: spacing.md, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  emptyList: { flexGrow: 1 },
  row: { gap: spacing.md },
  cell: { flex: 1 },
});
