import { CouponSchema, pageSchema, paths } from '@hungerly/api-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney, money } from '@hungerly/utils';
import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { useApiQuery } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { formatIstDateTime } from '@/features/wallet/format';

const CouponPageSchema = pageSchema(CouponSchema);

type StatusTone = 'warning' | 'info' | 'success' | 'neutral' | 'error';

const STATUS_TONE: Record<string, StatusTone> = {
  pending_approval: 'warning',
  scheduled: 'info',
  active: 'success',
  expired: 'neutral',
  rejected: 'error',
  cancelled: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  pending_approval: 'Pending approval',
  scheduled: 'Scheduled',
  active: 'Active',
  expired: 'Expired',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export default function CouponsScreen() {
  const query = useApiQuery(paths.partner.coupons, CouponPageSchema);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Coupons" />
      <QueryView query={query} loadingLabel="Loading coupons">
        {(page) => (
          <FlatList
            data={page.items}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.content}
            ListHeaderComponent={
              <Button
                label="Create coupon"
                icon="add"
                onPress={() => router.push('/coupons/new')}
                style={styles.createBtn}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="pricetag-outline"
                title="No coupons yet"
                message="Create a coupon to offer discounts to your customers."
              />
            }
            renderItem={({ item: coupon }) => (
              <Card
                onPress={() =>
                  router.push({ pathname: '/coupons/[id]', params: { id: coupon.id } })
                }
                style={styles.card}
              >
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text variant="label">{coupon.code}</Text>
                    <Text variant="bodySmall" color="textSecondary">
                      {coupon.title}
                    </Text>
                  </View>
                  <Badge
                    label={STATUS_LABEL[coupon.displayStatus] ?? coupon.displayStatus}
                    tone={STATUS_TONE[coupon.displayStatus] ?? 'neutral'}
                  />
                </View>
                <View style={styles.details}>
                  <Text variant="caption" color="textSecondary">
                    {coupon.discount.type === 'percent'
                      ? `${coupon.discount.percentBps / 100}% off`
                      : `${formatMoney(money(coupon.discount.amountMinor))} off`}
                    {' · '}Min order {formatMoney(coupon.minOrder)}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {coupon.redemptions} uses · Ends {formatIstDateTime(coupon.endsAt)}
                  </Text>
                </View>
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
  createBtn: { marginBottom: spacing.md },
  card: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
  details: { gap: spacing.xs },
});
