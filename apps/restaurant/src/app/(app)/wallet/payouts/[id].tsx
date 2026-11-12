import { PayoutSchema, paths } from '@hungerly/api-client';
import {
  Badge,
  Card,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

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

export default function PayoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { branchId } = useActiveBranch();
  const query = useApiQuery(
    branchId && id ? paths.partner.payout(branchId, id) : null,
    PayoutSchema,
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Payout details" />
      <QueryView query={query} loadingLabel="Loading payout">
        {(payout) => (
          <ScrollView contentContainerStyle={styles.content}>
            <Card style={styles.amountCard}>
              <Text variant="label" color="textSecondary">
                AMOUNT
              </Text>
              <Text variant="display">{formatMoney(payout.amount)}</Text>
              <Badge
                label={STATUS_LABEL[payout.status]}
                tone={STATUS_TONE[payout.status]}
              />
            </Card>

            <Card style={styles.section}>
              <InfoRow label="Destination" value={`••••${payout.destinationLast4}`} />
              <InfoRow label="Requested" value={formatIstDateTime(payout.createdAt)} />
              <InfoRow label="Last updated" value={formatIstDateTime(payout.updatedAt)} />
              {payout.utr !== null && (
                <InfoRow label="UTR" value={payout.utr} />
              )}
              {payout.providerPayoutId !== null && (
                <InfoRow label="Reference" value={payout.providerPayoutId} />
              )}
              <InfoRow
                label="Mode"
                value={payout.providerMode === 'live' ? 'Live' : 'Test'}
              />
            </Card>

            {payout.failureReason !== null && (
              <Card style={styles.section}>
                <Text variant="label" color="error">
                  FAILURE REASON
                </Text>
                <Text variant="body">{payout.failureReason}</Text>
              </Card>
            )}
          </ScrollView>
        )}
      </QueryView>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="caption" color="textSecondary" style={styles.infoLabel}>
        {label}
      </Text>
      <Text variant="body" style={styles.flex}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  amountCard: { padding: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
  section: { padding: spacing.lg, gap: spacing.sm },
  infoRow: { flexDirection: 'row', gap: spacing.md },
  infoLabel: { width: 100 },
  flex: { flex: 1 },
});
