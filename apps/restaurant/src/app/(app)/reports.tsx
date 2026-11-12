import { DashboardSchema, paths, WalletSummarySchema } from '@hungerly/api-client';
import {
  Card,
  colors,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { useApiQuery } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { DevDataNotice } from '@/features/shell/DevDataNotice';
import { PERIOD_LABELS, periodRange, type Period } from '@/features/wallet/format';

const PERIODS: Period[] = ['7d', '30d', 'month'];

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text variant="h3">{value}</Text>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

export default function ReportsScreen() {
  const { branchId } = useActiveBranch();
  const [period, setPeriod] = useState<Period>('7d');
  const now = new Date();
  const range = periodRange(period, now);

  const dashQuery = useApiQuery(
    branchId ? paths.partner.dashboard(branchId) : null,
    DashboardSchema,
  );
  const summaryQuery = useApiQuery(
    branchId ? paths.partner.walletSummary(branchId) : null,
    WalletSummarySchema,
    { from: range.from, to: range.to },
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Reports" />
      <QueryView query={dashQuery} loadingLabel="Loading reports">
        {(dash) => (
          <ScrollView contentContainerStyle={styles.content}>
            <DevDataNotice visible={dash.includesDevFixtures} />

            {/* Period selector */}
            <Card style={styles.periodCard}>
              <View style={styles.periodRow}>
                {PERIODS.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setPeriod(p)}
                    style={[styles.periodTab, p === period && styles.periodTabActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: p === period }}
                  >
                    <Text
                      variant={p === period ? 'label' : 'body'}
                      color={p === period ? 'primary' : 'textSecondary'}
                    >
                      {PERIOD_LABELS[p]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {summaryQuery.status === 'success' ? (
                <>
                  <DevDataNotice visible={summaryQuery.data.includesDevFixtures} />
                  <View style={styles.statsGrid}>
                    <StatCell
                      label="Orders"
                      value={String(summaryQuery.data.deliveredOrders)}
                    />
                    <StatCell
                      label="Gross sales"
                      value={formatMoney(summaryQuery.data.grossSales)}
                    />
                    <StatCell
                      label="Net earnings"
                      value={formatMoney(summaryQuery.data.netEarnings)}
                    />
                    <StatCell
                      label="Commission"
                      value={formatMoney({
                        amountMinor:
                          summaryQuery.data.grossSales.amountMinor -
                          summaryQuery.data.netEarnings.amountMinor,
                        currency: summaryQuery.data.grossSales.currency,
                      })}
                    />
                  </View>
                </>
              ) : summaryQuery.status === 'loading' ? (
                <Text variant="bodySmall" color="textSecondary">
                  Loading summary…
                </Text>
              ) : null}
            </Card>

            {/* Today's orders */}
            <Card style={styles.section}>
              <Text variant="label" color="textSecondary">
                TODAY&apos;S ORDERS
              </Text>
              <View style={styles.todayGrid}>
                <OrderCount label="Placed" value={dash.orderCounts.placed} color={colors.warning} />
                <OrderCount label="Preparing" value={dash.orderCounts.preparing} color={colors.info} />
                <OrderCount label="Ready" value={dash.orderCounts.ready_for_pickup} color={colors.primary} />
                <OrderCount label="Delivered" value={dash.orderCounts.delivered} color={colors.success} />
                <OrderCount label="Picked up" value={dash.orderCounts.picked_up} color={colors.success} />
                <OrderCount label="Cancelled" value={dash.orderCounts.cancelled} color={colors.error} />
              </View>
              <View style={styles.salesRow}>
                <Text variant="body" color="textSecondary">
                  Today&apos;s gross sales
                </Text>
                <Text variant="price">{formatMoney(dash.grossSalesToday)}</Text>
              </View>
            </Card>

            {/* 7-day sales trend */}
            {dash.trend.length > 0 && (
              <Card style={styles.section}>
                <Text variant="label" color="textSecondary">
                  7-DAY SALES TREND
                </Text>
                <View style={styles.chartRow}>
                  {dash.trend.map((day) => {
                    const maxSales = Math.max(
                      ...dash.trend.map((d) => d.grossSales.amountMinor),
                      1,
                    );
                    const height = Math.max(
                      4,
                      Math.round((day.grossSales.amountMinor / maxSales) * 60),
                    );
                    const date = new Date(day.date);
                    return (
                      <View
                        key={day.date}
                        style={styles.barCol}
                        accessibilityLabel={`${date.toDateString()}: ${day.orders} orders, ${formatMoney(day.grossSales)}`}
                      >
                        <Text variant="metadata" color="textTertiary" align="center">
                          {day.orders}
                        </Text>
                        <View style={[styles.barFill, { height }]} />
                        <Text variant="metadata" color="textTertiary" align="center">
                          {date.getDate()}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                  <Text variant="caption" color="textSecondary">
                    Bar height = gross sales · Number = order count
                  </Text>
                </View>
              </Card>
            )}

            {/* Info card about detailed reports */}
            <Card style={styles.infoCard}>
              <Text variant="label" color="textSecondary">
                EXPORT & DETAILED REPORTS
              </Text>
              <Text variant="bodySmall" color="textSecondary">
                Detailed transaction-level reports and CSV exports will be available in a future
                update. Your full transaction history is available in Wallet → Transactions.
              </Text>
            </Card>
          </ScrollView>
        )}
      </QueryView>
    </Screen>
  );
}

function OrderCount({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.orderCount}>
      <Text variant="h3" style={{ color }}>
        {value}
      </Text>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  periodCard: { padding: spacing.lg, gap: spacing.md },
  periodRow: { flexDirection: 'row', gap: spacing.sm },
  periodTab: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  periodTabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCell: {
    width: '47%',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  section: { padding: spacing.lg, gap: spacing.md },
  todayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  orderCount: { width: '30%', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  salesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, height: 80 },
  barCol: { flex: 1, alignItems: 'center', gap: spacing.xs, justifyContent: 'flex-end' },
  barFill: { width: '80%', backgroundColor: colors.primary, borderRadius: 3, minHeight: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  infoCard: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface },
});
