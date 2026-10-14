import { paths, WalletSchema, WalletSummarySchema } from '@hungerly/api-client';
import {
  Button,
  Card,
  colors,
  Divider,
  Icon,
  PressableScale,
  Badge,
  Screen,
  screenGutter,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { useApiQuery } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { DevDataNotice } from '@/features/shell/DevDataNotice';
import { TabHeader } from '@/features/shell/TabHeader';
import {
  PERIOD_LABELS,
  periodRange,
  type Period,
} from '@/features/wallet/format';
import { blockerAction } from '@/features/wallet/eligibility';

import { useState } from 'react';

const PERIODS: Period[] = ['7d', '30d', 'month'];

export default function WalletScreen() {
  const { branchId } = useActiveBranch();
  const [period, setPeriod] = useState<Period>('7d');
  const now = new Date();
  const range = periodRange(period, now);

  const walletQuery = useApiQuery(
    branchId ? paths.partner.wallet(branchId) : null,
    WalletSchema,
  );
  const summaryQuery = useApiQuery(
    branchId ? paths.partner.walletSummary(branchId) : null,
    WalletSummarySchema,
    { from: range.from, to: range.to },
  );

  return (
    <Screen edges={['top']}>
      <TabHeader title="Wallet" />
      <QueryView query={walletQuery} loadingLabel="Loading wallet">
        {(wallet) => (
          <ScrollView contentContainerStyle={styles.content}>
            <DevDataNotice visible={wallet.includesDevFixtures} />

            {/* Balance card */}
            <Card style={styles.balanceCard}>
              <Text variant="label" color="textSecondary">
                AVAILABLE TO WITHDRAW
              </Text>
              <Text variant="display">{formatMoney(wallet.available)}</Text>
              {wallet.pending.amountMinor > 0 && (
                <Text variant="bodySmall" color="textSecondary">
                  + {formatMoney(wallet.pending)} settling
                </Text>
              )}
              <View style={styles.balanceActions}>
                <Button
                  label="Withdraw"
                  icon="arrow-up-circle-outline"
                  onPress={() => router.push('/wallet/withdraw')}
                  disabled={!wallet.eligibility.canWithdraw}
                  style={styles.flex}
                />
                <Button
                  label="Bank account"
                  variant="outline"
                  icon="card-outline"
                  onPress={() => router.push('/wallet/payout-account')}
                  style={styles.flex}
                />
              </View>

              {wallet.eligibility.blockers.map((blocker) => {
                const action = blockerAction(blocker.code, branchId);
                const badge = (
                  <Badge
                    key={blocker.code}
                    label={blocker.message}
                    tone="warning"
                    icon="alert-circle-outline"
                  />
                );
                return action ? (
                  <PressableScale key={blocker.code} onPress={() => router.push(action.href as never)}>
                    {badge}
                  </PressableScale>
                ) : badge;
              })}
            </Card>

            {/* Period summary */}
            <Card style={styles.section}>
              <View style={styles.periodRow}>
                {PERIODS.map((p) => (
                  <Text
                    key={p}
                    variant={p === period ? 'label' : 'body'}
                    color={p === period ? 'primary' : 'textSecondary'}
                    onPress={() => setPeriod(p)}
                    style={[styles.periodTab, p === period && styles.periodTabActive]}
                  >
                    {PERIOD_LABELS[p]}
                  </Text>
                ))}
              </View>

              {summaryQuery.status === 'success' ? (
                <>
                  <DevDataNotice visible={summaryQuery.data.includesDevFixtures} />
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryItem}>
                      <Text variant="h2">{summaryQuery.data.deliveredOrders}</Text>
                      <Text variant="caption" color="textSecondary">
                        Orders
                      </Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text variant="price">{formatMoney(summaryQuery.data.grossSales)}</Text>
                      <Text variant="caption" color="textSecondary">
                        Gross sales
                      </Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text variant="price">{formatMoney(summaryQuery.data.netEarnings)}</Text>
                      <Text variant="caption" color="textSecondary">
                        Net earnings
                      </Text>
                    </View>
                  </View>
                </>
              ) : summaryQuery.status === 'loading' ? (
                <Text variant="bodySmall" color="textSecondary">
                  Loading summary…
                </Text>
              ) : null}
            </Card>

            {/* Navigation links */}
            <Card>
              <NavRow
                icon="list-outline"
                label="Transaction history"
                onPress={() => router.push('/wallet/transactions')}
              />
              <Divider />
              <NavRow
                icon="arrow-up-circle-outline"
                label="Payout history"
                onPress={() => router.push('/wallet/payouts')}
              />
            </Card>
          </ScrollView>
        )}
      </QueryView>
    </Screen>
  );
}

function NavRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <View
      style={styles.navRow}
      accessible
      accessibilityRole="button"
      onAccessibilityAction={() => onPress()}
    >
      <Icon name={icon as never} color="textSecondary" />
      <Text variant="body" style={styles.flex}>
        {label}
      </Text>
      <Icon name="chevron-forward-outline" color="textTertiary" size="sm" />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  balanceCard: { padding: spacing.lg, gap: spacing.md },
  balanceActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  section: { padding: spacing.lg, gap: spacing.md },
  periodRow: { flexDirection: 'row', gap: spacing.md },
  periodTab: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  periodTabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  summaryRow: { flexDirection: 'row', gap: spacing.md },
  summaryItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
});
