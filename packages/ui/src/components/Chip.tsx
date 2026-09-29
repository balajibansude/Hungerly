import { Pressable, StyleSheet } from 'react-native';

import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  icon?: IconName;
  onPress: () => void;
  accessibilityHint?: string;
}

/** Toggleable filter chip. Selection is announced as a checked state. */
export function Chip({ label, selected = false, icon, onPress, accessibilityHint }: ChipProps) {
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
        selected ? styles.selected : styles.idle,
        pressed && !selected && styles.pressed,
      ]}
    >
      {icon && <Icon name={icon} size="sm" color={selected ? 'onSecondary' : 'textSecondary'} />}
      <Text variant="label" color={selected ? 'onSecondary' : 'textPrimary'}>
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
    borderWidth: 1,
  },
  idle: { backgroundColor: colors.surface, borderColor: colors.border },
  selected: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  pressed: { backgroundColor: colors.surfacePressed },
});
