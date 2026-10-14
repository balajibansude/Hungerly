import { CouponSchema, paths } from '@hungerly/api-client';
import {
  Badge,
  Button,
  Card,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney, money } from '@hungerly/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { api } from '@/lib/api';
import { useApiQuery, useMutation } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { formatIstDateTime } from '@/features/wallet/format';

const STATUS_TONE = {
  pending_approval: 'warning',
  scheduled: 'info',
  active: 'success',
  expired: 'neutral',
  rejected: 'error',
  cancelled: 'neutral',
} as const;

const STATUS_LABEL = {
  pending_approval: 'Pending approval',
  scheduled: 'Scheduled',
  active: 'Active',
  expired: 'Expired',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
} as const;

export default function CouponDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useApiQuery(id ? paths.partner.coupon(id) : null, CouponSchema);

  const { run: cancel, pending: cancelling } = useMutation(async () => {
    if (!id) return;
    Alert.alert('Cancel coupon', 'Are you sure you want to cancel this coupon?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel coupon',
        style: 'destructive',
        onPress: async () => {
          await api.request('POST', paths.partner.couponCancel(id), { schema: CouponSchema });
          query.refetch?.();
        },
      },
    ]);
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Coupon details" />
      <QueryView query={query} loadingLabel="Loading coupon">
        {(coupon) => (
          <ScrollView contentContainerStyle={styles.content}>
            <Card style={styles.header}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text variant="h2">{coupon.code}</Text>
                  <Text variant="body" color="textSecondary">
                    {coupon.title}
                  </Text>
                </View>
                <Badge
                  label={STATUS_LABEL[coupon.displayStatus]}
                  tone={STATUS_TONE[coupon.displayStatus]}
                />
              </View>
              {coupon.description.length > 0 && (
                <Text variant="bodySmall" color="textSecondary">
                  {coupon.description}
                </Text>
              )}
            </Card>

            <Card style={styles.section}>
              <Text variant="label" color="textSecondary">
                DISCOUNT
              </Text>
              <Text variant="body">
                {coupon.discount.type === 'percent'
                  ? `${coupon.discount.percentBps / 100}% off`
                  : `${formatMoney(money(coupon.discount.amountMinor))} flat off`}
              </Text>
              <Text variant="bodySmall" color="textSecondary">
                Min order: {formatMoney(coupon.minOrder)}
              </Text>
            </Card>

            <Card style={styles.section}>
              <Text variant="label" color="textSecondary">
                VALIDITY
              </Text>
              <Text variant="body">{formatIstDateTime(coupon.startsAt)}</Text>
              <Text variant="caption" color="textSecondary">
                to
              </Text>
              <Text variant="body">{formatIstDateTime(coupon.endsAt)}</Text>
            </Card>

            <Card style={styles.section}>
              <Text variant="label" color="textSecondary">
                USAGE
              </Text>
              <Text variant="body">{coupon.redemptions} redemptions</Text>
              {coupon.usageLimitTotal !== null && (
                <Text variant="bodySmall" color="textSecondary">
                  Limit: {coupon.usageLimitTotal} total
                </Text>
              )}
              {coupon.usageLimitPerCustomer !== null && (
                <Text variant="bodySmall" color="textSecondary">
                  {coupon.usageLimitPerCustomer} per customer
                </Text>
              )}
            </Card>

            {coupon.rejectionReason && (
              <Card style={styles.section}>
                <Text variant="label" color="error">
                  REJECTION REASON
                </Text>
                <Text variant="body">{coupon.rejectionReason}</Text>
              </Card>
            )}

            {(coupon.displayStatus === 'active' || coupon.displayStatus === 'scheduled') && (
              <Button
                label="Cancel coupon"
                variant="outline"
                icon="close-circle-outline"
                onPress={() => cancel()}
                loading={cancelling}
                fullWidth
              />
            )}
          </ScrollView>
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  header: { padding: spacing.lg, gap: spacing.sm },
  section: { padding: spacing.lg, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
});
