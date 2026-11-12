import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, type ColorToken } from '../theme/colors';
import { elevation, minTouchTarget, radius, spacing } from '../theme/layout';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: 'start' | 'end';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Overrides the spoken label when the visible label needs context. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const variantStyles: Record<
  ButtonVariant,
  { background: ColorToken | 'transparent'; text: ColorToken; border?: ColorToken }
> = {
  primary: { background: 'primary', text: 'onPrimary' },
  secondary: { background: 'secondary', text: 'onSecondary' },
  outline: { background: 'transparent', text: 'textPrimary', border: 'borderStrong' },
  ghost: { background: 'transparent', text: 'primaryText' },
  danger: { background: 'errorSoft', text: 'error' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  iconPosition = 'start',
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const tokens = variantStyles[variant];
  const textColor: ColorToken = inactive ? 'onDisabled' : tokens.text;
  const backgroundColor = inactive
    ? colors.disabled
    : tokens.background === 'transparent'
      ? 'transparent'
      : colors[tokens.background];

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.base,
        size === 'lg' ? styles.large : styles.medium,
        { backgroundColor },
        variant === 'primary' && !inactive && elevation.brand,
        tokens.border && !inactive && { borderWidth: 1, borderColor: colors[tokens.border] },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[textColor]} />
      ) : (
        <View style={[styles.content, iconPosition === 'end' && styles.reverse]}>
          {icon && <Icon name={icon} size="md" color={textColor} />}
          <Text variant="button" color={textColor} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  large: { minHeight: 56 },
  medium: { minHeight: minTouchTarget - 4, paddingHorizontal: spacing.lg },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
});
