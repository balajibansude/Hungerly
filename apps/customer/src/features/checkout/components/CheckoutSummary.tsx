import { Icon, spacing, Text } from '@hungerly/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CheckoutSummaryText } from '../summary';

/**
 * Compact recap above Place order: where it goes (with Change) and how it's paid, with the
 * amount payable. The full address and payment cards stay in the scrolling content.
 */
export function CheckoutSummary({
  summary,
  onChangeAddress,
}: {
  summary: CheckoutSummaryText;
  onChangeAddress: () => void;
}) {
  return (
    <View style={styles.container} testID="checkout-summary">
      {summary.address && (
        <View style={styles.row}>
          <Icon name="location-outline" size="sm" color="primary" />
          <Text variant="bodySmall" color="textSecondary" numberOfLines={1} style={styles.flex}>
            Delivering to{' '}
            <Text variant="label" color="textPrimary">
              {summary.address}
            </Text>
          </Text>
          <Pressable
            onPress={onChangeAddress}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Change delivery address"
            testID="checkout-summary-change-address"
          >
            <Text variant="label" color="primaryText">
              Change
            </Text>
          </Pressable>
        </View>
      )}
      <View
        style={styles.row}
        accessible
        accessibilityLabel={`${summary.payment}. To pay ${summary.payable}`}
      >
        <Icon name="cash-outline" size="sm" color="primary" />
        <Text variant="bodySmall" color="textSecondary" style={styles.flex}>
          Pay using{' '}
          <Text variant="label" color="textPrimary">
            {summary.payment}
          </Text>
        </Text>
        <Text variant="label">{summary.payable}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
