import { StyleSheet, View } from 'react-native';

import type { Money } from '../shared/types';
import { formatMoney } from '../shared';

import type { ColorToken } from '../theme/colors';
import { spacing } from '../theme/layout';
import type { TypographyVariant } from '../theme/typography';
import { Text } from './Text';

export interface PriceProps {
  value: Money;
  /** Original price shown struck through, e.g. before a discount. */
  compareAt?: Money;
  variant?: Extract<TypographyVariant, 'price' | 'h3' | 'h2' | 'body' | 'bodySmall'>;
  color?: ColorToken;
}

export function Price({ value, compareAt, variant = 'price', color = 'textPrimary' }: PriceProps) {
  const formatted = formatMoney(value);
  if (!compareAt) {
    return (
      <Text variant={variant} color={color}>
        {formatted}
      </Text>
    );
  }
  const original = formatMoney(compareAt);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${formatted}, reduced from ${original}`}
    >
      <Text variant={variant} color={color}>
        {formatted}
      </Text>
      <Text variant="bodySmall" color="textTertiary" style={styles.strike}>
        {original}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs + spacing.xxs },
  strike: { textDecorationLine: 'line-through' },
});
