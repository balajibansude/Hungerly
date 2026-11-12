import { Pressable, StyleSheet } from 'react-native';

import type { ColorToken } from '../theme/colors';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Color variant for filter chips with food-type semantics. */
export type ChipTint = 'primary' | 'danger' | 'jain';

export interface ChipProps {
  label: string;
  selected?: boolean;
  icon?: IconName;
  onPress: () => void;
  accessibilityHint?: string;
  /** Semantic color variant. 'primary' (default) = brand green; 'danger' = non-veg red; 'jain' = jain yellow. */
  tint?: ChipTint;
}

const IDLE_BORDER: Record<ChipTint, string> = {
  primary: colors.primary,
  danger: colors.nonVeg,
  jain: colors.jain,
};

const SELECTED_BG: Record<ChipTint, string> = {
  primary: colors.primary,
  danger: colors.nonVeg,
  jain: colors.jain,
};

const PRESSED_BG: Record<ChipTint, string> = {
  primary: colors.primarySoft,
  danger: colors.errorSoft,
  jain: colors.accentSoft,
};

const IDLE_ICON: Record<ChipTint, ColorToken> = {
  primary: 'primaryText',
  danger: 'nonVeg',
  jain: 'jainInk',
};

const SELECTED_ICON: Record<ChipTint, ColorToken> = {
  primary: 'onPrimary',
  danger: 'onPrimary',
  jain: 'textPrimary',
};

/** Pill-shaped filter chip: colored outline, filled with the tint color when selected. */
export function Chip({ label, selected = false, icon, onPress, accessibilityHint, tint = 'primary' }: ChipProps) {
  const iconColor = selected ? SELECTED_ICON[tint] : IDLE_ICON[tint];
  const textColor = selected ? SELECTED_ICON[tint] : IDLE_ICON[tint];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="togglebutton"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: selected ? SELECTED_BG[tint] : IDLE_BORDER[tint] },
        selected
          ? { backgroundColor: SELECTED_BG[tint] }
          : pressed
            ? { backgroundColor: PRESSED_BG[tint] }
            : styles.idle,
      ]}
    >
      {icon && <Icon name={icon} size="sm" color={iconColor} />}
      <Text variant="label" color={textColor}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + spacing.xxs,
    paddingHorizontal: spacing.md + spacing.xxs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  idle: { backgroundColor: colors.surface },
});
