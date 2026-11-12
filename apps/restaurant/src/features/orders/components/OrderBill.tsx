import type { Order } from '@hungerly/api-client';
import type { Money } from '@hungerly/types';
import { Divider, spacing, Text } from '@hungerly/ui';
import { formatMoney, isBillConsistent } from '@hungerly/utils';
import { StyleSheet, View } from 'react-native';

type Bill = Order['bill'];

/** Charges in the order snapshot, in the order customers saw them. Zero charges are hidden. */
const CHARGES: { key: Exclude<keyof Bill, 'subtotal' | 'discount' | 'total' | 'restaurantFundedDiscount'>; label: string }[] = [
  { key: 'packagingFee', label: 'Packaging' },
  { key: 'deliveryFee', label: 'Delivery fee' },
  { key: 'platformFee', label: 'Platform fee' },
  { key: 'tax', label: 'Taxes' },
  { key: 'tip', label: 'Rider tip' },
];

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text
        variant={strong ? 'label' : 'body'}
        color={strong ? 'textPrimary' : 'textSecondary'}
        style={styles.flex}
      >
        {label}
      </Text>
      <Text variant={strong ? 'price' : 'body'}>{value}</Text>
    </View>
  );
}

const nonZero = (value: Money) => value.amountMinor !== 0;

/**
 * The order's bill exactly as stored (server-computed snapshot). Nothing is recalculated
 * here; a total that does not match its parts is flagged rather than "fixed".
 */
export function OrderBill({ bill }: { bill: Bill }) {
  return (
    <View style={styles.bill}>
      <Row label="Item total" value={formatMoney(bill.subtotal)} />
      {CHARGES.filter((c) => nonZero(bill[c.key])).map((c) => (
        <Row key={c.key} label={c.label} value={formatMoney(bill[c.key])} />
      ))}
      {nonZero(bill.discount) && <Row label="Discount" value={`−${formatMoney(bill.discount)}`} />}
      <Divider />
      <Row label="Order total" value={formatMoney(bill.total)} strong />
      {!isBillConsistent(bill) && (
        <Text variant="bodySmall" color="error">
          This bill doesn’t add up. Contact Hungerly partner support before preparing.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bill: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
