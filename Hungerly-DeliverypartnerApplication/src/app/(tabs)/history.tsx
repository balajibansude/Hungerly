import { useInfiniteQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { dateLabel, km, rupees, time } from '@/lib/format';
import { keys } from '@/lib/queries';
import type { HistoryItem, Page } from '@/lib/types';
import { Badge, colors, EmptyState, ErrorState, Icon, radius, screenGutter, Skeleton, spacing, Text } from '@/ui';

export default function History() {
  const insets = useSafeAreaInsets();
  const q = useInfiniteQuery({
    queryKey: keys.history,
    queryFn: ({ pageParam }) => api<Page<HistoryItem>>('/delivery/history', { query: { cursor: pageParam, limit: 20 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <Text variant="h1" style={styles.title} accessibilityRole="header">Trips</Text>
      {q.isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={84} radius="card" />)}
        </View>
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={[styles.list, items.length === 0 && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={colors.primary} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState icon="receipt-outline" title="No trips yet" message="Completed deliveries show up here with what you earned." />}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} /> : null}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)} style={styles.row}>
              <View style={[styles.icon, { backgroundColor: item.status === 'delivered' ? colors.successSoft : colors.surfaceMuted }]}>
                <Icon name={item.status === 'delivered' ? 'checkmark' : 'close'} color={item.status === 'delivered' ? 'success' : 'textTertiary'} />
              </View>
              <View style={styles.flex}>
                <Text variant="h3" numberOfLines={1}>{item.restaurant_name}</Text>
                <Text variant="caption" color="textTertiary" numberOfLines={1}>
                  {dateLabel(item.delivered_at ?? item.created_at)} · {time(item.delivered_at ?? item.created_at)}
                </Text>
              </View>
              <View style={styles.right}>
                {item.status === 'delivered' ? (
                  <Text variant="price">+{rupees(item.earned)}</Text>
                ) : (
                  <Badge label={item.status === 'cancelled' ? 'Cancelled' : 'Failed'} tone="neutral" />
                )}
                <Text variant="caption" color="textTertiary">{km(item.distance_m)}</Text>
              </View>
            </Animated.View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, gap: 2 },
  title: { paddingHorizontal: screenGutter, marginBottom: spacing.lg },
  list: { paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'], gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  right: { alignItems: 'flex-end', gap: 2 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
