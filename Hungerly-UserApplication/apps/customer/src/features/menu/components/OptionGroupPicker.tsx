import type { FoodOptionGroup, Id } from '@hungerly/types';
import { colors, Icon, minTouchTarget, radius, spacing, Text } from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { Pressable, StyleSheet, View } from 'react-native';

import { describeGroupRule } from '../selection';

export function OptionGroupPicker({
  group,
  selected,
  onToggle,
  error,
}: {
  group: FoodOptionGroup;
  selected: Id[];
  onToggle: (optionId: Id) => void;
  error?: string;
}) {
  const single = group.maxSelect === 1;
  return (
    <View style={styles.group} accessibilityRole={single ? 'radiogroup' : undefined}>
      <View style={styles.header}>
        <Text variant="h3" accessibilityRole="header">
          {group.name}
        </Text>
        <Text variant="caption" color={error ? 'error' : 'textTertiary'}>
          {error ?? describeGroupRule(group)}
        </Text>
      </View>
      {group.options.map((option) => {
        const checked = selected.includes(option.id);
        const atLimit = !single && !checked && selected.length >= group.maxSelect;
        const disabled = !option.isAvailable || atLimit;
        const price =
          option.priceDelta.amountMinor > 0 ? `+ ${formatMoney(option.priceDelta)}` : 'Included';
        return (
          <Pressable
            key={option.id}
            onPress={() => onToggle(option.id)}
            disabled={disabled}
            accessibilityRole={single ? 'radio' : 'checkbox'}
            accessibilityState={{ checked, disabled }}
            accessibilityLabel={`${option.name}, ${price}${option.isAvailable ? '' : ', unavailable'}`}
            style={({ pressed }) => [
              styles.option,
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <View style={[single ? styles.radio : styles.checkbox, checked && styles.checked]}>
              {checked &&
                (single ? (
                  <View style={styles.radioDot} />
                ) : (
                  <Icon name="checkmark" size="sm" color="onPrimary" />
                ))}
            </View>
            <Text variant="body" style={styles.flex}>
              {option.name}
            </Text>
            <Text variant="bodySmall" color="textSecondary">
              {option.isAvailable ? price : 'Unavailable'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const CONTROL = 22;

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  header: { gap: spacing.xxs, marginBottom: spacing.xs },
  option: {
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  flex: { flex: 1 },
  radio: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: radius.sm - 2,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { borderColor: colors.primary, backgroundColor: colors.primary },
  radioDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.onPrimary },
});
