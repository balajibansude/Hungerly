import { LedgerPageSchema, paths } from '@hungerly/api-client';
import {
  Badge,
  Card,
  colors,
  EmptyState,
  Icon,
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
import {
  formatIstDateTime,
  isHeld,
  ledgerTypeMeta,
} from '@/features/wallet/format';

export default function TransactionsScreen() {
  const { branchId } = useActiveBranch();
  const query = useApiQuery(
    branchId ? paths.partner.walletTransactions(branchId) : null,
    LedgerPageSchema,
  );
  const now = new Date();

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Transactions" />
      <QueryView query={query} loadingLabel="Loading transactions">
        {(page) => (
          <FlatList
            data={page.items}
            keyExtractor={(e) => e.id}
            contentContainerStyle={styles.content}
            ListEmptyComponent={
              <EmptyState
                icon="receipt-outline"
                title="No transactions yet"
                message="Earnings and deductions will appear here."
              />
            }
            renderItem={({ item: entry }) => {
              const meta = ledgerTypeMeta[entry.type];
              const credit = entry.amount.amountMinor > 0;
              const held = isHeld(entry, now);
              return (
                <Card style={styles.row}>
                  <View style={styles.icon}>
                    <Icon name={meta.icon} color={credit ? 'success' : 'textSecondary'} />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="label">{meta.label}</Text>
                    <Text variant="caption" color="textSecondary">
                      {formatIstDateTime(entry.createdAt)}
                    </Text>
                    {entry.orderNumber && (
                      <Text variant="caption" color="textSecondary">
                        Order #{entry.orderNumber}
                      </Text>
                    )}
                    {held && (
                      <Badge label="Settling" tone="neutral" />
                    )}
                  </View>
                  <Text
                    variant="price"
                    color={credit ? 'success' : 'error'}
                  >
                    {credit ? '+' : ''}{formatMoney(entry.amount)}
                  </Text>
                </Card>
              );
            }}
          />
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  flex: { flex: 1, gap: spacing.xs },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
