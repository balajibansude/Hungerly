import {
  Pressable,
  Switch as RNSwitch,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors } from '../theme/colors';
import { minTouchTarget, spacing } from '../theme/layout';
import { Text } from './Text';

const trackColor = { false: colors.borderStrong, true: colors.success } as const;

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Required: a bare switch has no visible label of its own. */
  accessibilityLabel: string;
  disabled?: boolean;
}

/**
 * On/off control for settings that take effect immediately (availability, open/closed).
 * Use `SwitchRow` when the switch has its own visible label.
 */
export function Switch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
}: SwitchProps) {
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={trackColor}
      thumbColor={colors.surface}
      ios_backgroundColor={colors.borderStrong}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A labelled switch; the whole row is one touch target and one accessible element. */
export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  style,
}: SwitchRowProps) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      style={[styles.row, style]}
    >
      <View style={styles.text}>
        <Text variant="label" color={disabled ? 'onDisabled' : 'textPrimary'}>
          {label}
        </Text>
        {description && (
          <Text variant="bodySmall" color="textSecondary">
            {description}
          </Text>
        )}
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <RNSwitch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={trackColor}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.borderStrong}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1, gap: spacing.xxs },
});
