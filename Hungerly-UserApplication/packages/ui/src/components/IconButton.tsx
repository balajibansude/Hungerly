import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, type ColorToken } from '../theme/colors';
import { hitSlop, radius } from '../theme/layout';
import { Icon, type IconName } from './Icon';

export type IconButtonVariant = 'surface' | 'ghost' | 'overlay' | 'primary';

export interface IconButtonProps {
  icon: IconName;
  /** Required: icon-only controls must describe their action to screen readers. */
  accessibilityLabel: string;
  onPress: () => void;
  variant?: IconButtonVariant;
  iconColor?: ColorToken;
  disabled?: boolean;
  badgeVisible?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const backgrounds: Record<IconButtonVariant, string> = {
  surface: colors.surface,
  ghost: 'transparent',
  overlay: 'rgba(255, 255, 255, 0.92)',
  primary: colors.primary,
};

const size = 44;

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'surface',
  iconColor,
  disabled = false,
  badgeVisible = false,
  style,
  testID,
}: IconButtonProps) {
  const color: ColorToken =
    iconColor ?? (disabled ? 'onDisabled' : variant === 'primary' ? 'onPrimary' : 'textPrimary');

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      // 44pt visual size; hitSlop extends the touch area beyond the 48pt minimum.
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: backgrounds[variant] },
        variant === 'surface' && styles.bordered,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Icon name={icon} size="md" color={color} />
      {badgeVisible && <View style={styles.badge} pointerEvents="none" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: size,
    height: size,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bordered: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pressed: { opacity: 0.7 },
  badge: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
