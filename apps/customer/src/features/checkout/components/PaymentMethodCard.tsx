import type { PaymentMethod } from '@hungerly/types';
import { Badge, colors, Icon, radius, spacing, Text, type IconName } from '@hungerly/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { paymentMethodTitles } from '../summary';
import { CheckoutSection } from './CheckoutSection';

const OPTIONS: {
  id: PaymentMethod;
  icon: IconName;
  title: string;
  subtitle: string;
  available: boolean;
}[] = [
  {
    id: 'cod',
    icon: 'cash-outline',
    title: paymentMethodTitles.cod,
    subtitle: 'Pay in cash or UPI to the delivery partner',
    available: true,
  },
  {
    id: 'online',
    icon: 'card-outline',
    title: paymentMethodTitles.online,
    subtitle: 'UPI, cards and wallets',
    available: false,
  },
];

/** Payment choice. Only cash on delivery is available; online payment is shown as coming soon. */
export function PaymentMethodCard({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}) {
  return (
    <CheckoutSection icon="wallet-outline" title="Payment method">
      <View style={styles.options} accessibilityRole="radiogroup">
        {OPTIONS.map((option) => {
          const selected = option.available && value === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => onChange(option.id)}
              disabled={!option.available}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !option.available }}
              accessibilityLabel={`${option.title}. ${option.subtitle}${option.available ? '' : '. Coming soon'}`}
              style={[
                styles.option,
                selected && styles.optionSelected,
                !option.available && styles.optionDisabled,
              ]}
              testID={`payment-${option.id}`}
            >
              <Icon
                name={option.icon}
                color={option.available ? (selected ? 'primary' : 'textSecondary') : 'onDisabled'}
              />
              <View style={styles.copy}>
                <Text variant="label" color={option.available ? 'textPrimary' : 'textTertiary'}>
                  {option.title}
                </Text>
                <Text variant="caption" color="textTertiary">
                  {option.subtitle}
                </Text>
              </View>
              {option.available ? (
                <Icon
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  color={selected ? 'primary' : 'textTertiary'}
                />
              ) : (
                <Badge label="Coming soon" tone="neutral" />
              )}
            </Pressable>
          );
        })}
      </View>
    </CheckoutSection>
  );
}

const styles = StyleSheet.create({
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  optionSelected: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionDisabled: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  copy: { flex: 1, gap: spacing.xxs },
});
