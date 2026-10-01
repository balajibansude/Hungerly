import type { Money } from '@hungerly/types';
import { Card, Divider, Icon, spacing, Text } from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { StyleSheet, View } from 'react-native';

import type { Bill } from '../pricing';

/**
 * Transparent bill: every component of the total is listed (product principle: no
 * surprise fees). Labelled as an estimate because the server finalises prices.
 */
export function BillSummary({ bill, offerLabel }: { bill: Bill; offerLabel?: string }) {
  return (
    <Card style={styles.card}>
      <Text variant="h3" accessibilityRole="header">
        Bill details
      </Text>
      <Row label="Item total" value={bill.subtotal} />
      <Row label="Delivery fee" value={bill.deliveryFee} />
      {bill.discount.amountMinor > 0 ? (
        <Row
          label={offerLabel ? `Offer · ${offerLabel}` : 'Discount'}
          value={bill.discount}
          negative
        />
      ) : null}
      <Divider />
      <Row label="Estimated total" value={bill.total} strong />
      <View style={styles.note}>
        <Icon name="information-circle-outline" size="sm" color="textTertiary" />
        <Text variant="caption" color="textTertiary" style={styles.flex}>
          Taxes and the final amount are confirmed at checkout.
        </Text>
      </View>
    </Card>
  );
}

function Row({
  label,
  value,
  negative = false,
  strong = false,
}: {
  label: string;
  value: Money;
  negative?: boolean;
  strong?: boolean;
}) {
  const formatted = `${negative ? '−' : ''}${formatMoney(value)}`;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}: ${negative ? 'minus ' : ''}${formatMoney(value)}`}
    >
      <Text
        variant={strong ? 'h3' : 'body'}
        color={strong ? 'textPrimary' : 'textSecondary'}
        style={styles.flex}
      >
        {label}
      </Text>
      <Text variant={strong ? 'h3' : 'price'} color={negative ? 'success' : 'textPrimary'}>
        {formatted}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  note: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
});
