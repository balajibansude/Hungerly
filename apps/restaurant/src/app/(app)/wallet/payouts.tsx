import { PayoutPageSchema, paths } from '@hungerly/api-client';
import {
  Badge,
  Card,
  EmptyState,
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
import { formatIstDateTime } from '@/features/wallet/format';

const STATUS_TONE = {
  requested: 'info',
  queued: 'info',
  pending_approval: 'warning',
  processing: 'info',
  processed: 'success',
  failed: 'error',
  reversed: 'error',
  cancelled: 'neutral',
  rejected: 'error',
} as const;

const STATUS_LABEL = {
  requested: 'Requested',
  queued: 'Queued',
  pending_approval: 'Pending approval',
  processing: 'Processing',
  processed: 'Paid out',
  failed: 'Failed',
  reversed: 'Reversed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
} as const;

export default function PayoutsScreen() {
  const { branchId } = useActiveBranch();
  const query = useApiQuery(
    branchId ? paths.partner.payouts(branchId) : null,
    PayoutPageSchema,
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Payout history" />
      <QueryView query={query} loadingLabel="Loading payouts">
        {(page) => (
          <FlatList
            data={page.items}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.content}
            ListEmptyComponent={
              <EmptyState
                icon="arrow-up-circle-outline"
                title="No payouts yet"
                message="Your withdrawal history will appear here."
              />
            }
            renderItem={({ item: payout }) => (
              <Card style={styles.row}>
                <View style={styles.flex}>
                  <Text variant="price">{formatMoney(payout.amount)}</Text>
                  <Text variant="caption" color="textSecondary">
                    {formatIstDateTime(payout.createdAt)} · ••••{payout.destinationLast4}
                  </Text>
                  {payout.utr && (
                    <Text variant="caption" color="textSecondary">
                      UTR: {payout.utr}
                    </Text>
                  )}
                  {payout.failureReason && (
                    <Text variant="caption" color="error">
                      {payout.failureReason}
                    </Text>
                  )}
                </View>
                <Badge
                  label={STATUS_LABEL[payout.status]}
                  tone={STATUS_TONE[payout.status]}
                />
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg },
  flex: { flex: 1, gap: spacing.xs },
});
