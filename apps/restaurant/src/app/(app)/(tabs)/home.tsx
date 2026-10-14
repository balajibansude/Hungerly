import { DashboardSchema, paths } from '@hungerly/api-client';
import {
  Badge,
  Card,
  colors,
  Icon,
  Screen,
  screenGutter,
  spacing,
  Text,
  type IconName,
} from '@hungerly/ui';
import { DevDataNotice } from '@/features/shell/DevDataNotice';
import { formatMoney } from '@hungerly/utils';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { useApiQuery } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { TabHeader } from '@/features/shell/TabHeader';

interface QuickLink {
  icon: IconName;
  label: string;
  href: string;
}

const QUICK_LINKS: QuickLink[] = [
  { icon: 'receipt-outline', label: 'Orders', href: '/orders/history' },
  { icon: 'star-outline', label: 'Reviews', href: '/reviews' },
  { icon: 'pricetag-outline', label: 'Coupons', href: '/coupons' },
  { icon: 'card-outline', label: 'Wallet', href: '/wallet' },
  { icon: 'restaurant-outline', label: 'Menu', href: '/menu' },
  { icon: 'chatbubble-ellipses-outline', label: 'Support', href: '/support' },
];

/** Dashboard home: today's snapshot, trend, pending actions, and quick links. */
export default function HomeScreen() {
  const { branchId, branch } = useActiveBranch();
  const query = useApiQuery(
    branchId ? paths.partner.dashboard(branchId) : null,
    DashboardSchema,
  );

  const liveCount =
    query.status === 'success'
      ? (query.data.orderCounts.placed ?? 0) + (query.data.orderCounts.preparing ?? 0) + (query.data.orderCounts.ready_for_pickup ?? 0)
      : 0;

  return (
    <Screen edges={['top']}>
      <TabHeader title={branch?.name ?? 'Dashboard'} />
      <QueryView query={query} loadingLabel="Loading dashboard">
        {(data) => (
          <ScrollView contentContainerStyle={styles.content}>
            <DevDataNotice visible={data.includesDevFixtures} />

            {/* Today's stats */}
            <Card style={styles.statsCard}>
              <Text variant="label" color="textSecondary">
                TODAY
              </Text>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text variant="h2">{liveCount}</Text>
                  <Text variant="caption" color="textSecondary">
                    Live
                  </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text variant="h2">
                    {data.orderCounts.delivered + data.orderCounts.picked_up}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    Completed
                  </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text variant="price">{formatMoney(data.grossSalesToday)}</Text>
                  <Text variant="caption" color="textSecondary">
                    Sales
                  </Text>
                </View>
              </View>
            </Card>

            {/* Pending actions */}
            {data.pendingActions.length > 0 && (
              <View style={styles.section}>
                <Text variant="h3" style={styles.sectionTitle}>
                  Action needed
                </Text>
                {data.pendingActions.map((action, i) => (
                  <Badge
                    key={i}
                    label={action.message}
                    tone={action.kind === 'orders_waiting' ? 'warning' : 'info'}
                    icon="alert-circle-outline"
                  />
                ))}
              </View>
            )}

            {/* 7-day trend */}
            {data.trend.length > 0 && (
              <Card style={styles.trendCard}>
                <Text variant="label" color="textSecondary">
                  LAST 7 DAYS
                </Text>
                <View style={styles.trendRow}>
                  {data.trend.map((day) => {
                    const maxSales = Math.max(...data.trend.map((d) => d.grossSales.amountMinor), 1);
                    const height = Math.max(4, Math.round((day.grossSales.amountMinor / maxSales) * 48));
                    return (
                      <View key={day.date} style={styles.bar} accessibilityLabel={`${day.date}: ${day.orders} orders`}>
                        <View style={[styles.barFill, { height }]} />
                        <Text variant="metadata" color="textTertiary">
                          {new Date(day.date).getDate()}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}

            {/* Quick links */}
            <View style={styles.section}>
              <Text variant="h3" style={styles.sectionTitle}>
                Quick links
              </Text>
              <Card style={styles.quickLinksGrid}>
                {QUICK_LINKS.map((link) => (
                  <Pressable
                    key={link.label}
                    style={styles.quickLinkItem}
                    onPress={() => router.push(link.href as never)}
                    accessibilityRole="button"
                    accessibilityLabel={link.label}
                  >
                    <View style={styles.quickLinkBadge}>
                      <Icon name={link.icon} color="primary" size="lg" />
                    </View>
                    <Text variant="caption" color="textSecondary" align="center" numberOfLines={1}>
                      {link.label}
                    </Text>
                  </Pressable>
                ))}
              </Card>
            </View>
          </ScrollView>
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  statsCard: { padding: spacing.lg, gap: spacing.sm },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: spacing.xs },
  statDivider: { width: 1, height: 36, backgroundColor: colors.border },
  section: { gap: spacing.sm },
  sectionTitle: { paddingTop: spacing.xs },
  trendCard: { padding: spacing.lg, gap: spacing.md },
  trendRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, height: 56 },
  bar: { flex: 1, alignItems: 'center', gap: spacing.xs, justifyContent: 'flex-end' },
  barFill: { width: '80%', backgroundColor: colors.primary, borderRadius: 3, minHeight: 4 },
  quickLinksGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.md, gap: spacing.sm },
  quickLinkItem: { width: '30%', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  quickLinkBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
