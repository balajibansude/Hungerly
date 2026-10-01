import type { LocalTime } from '@hungerly/types';
import { colors, IconButton, radius, spacing, Text } from '@hungerly/ui';
import { formatLocalTime12h } from '@hungerly/utils';
import { StyleSheet, View } from 'react-native';

import { shiftTime } from '../time';

export interface TimeStepperProps {
  label: string;
  value: LocalTime;
  onChange: (value: LocalTime) => void;
}

/**
 * − time + control. No native picker module is needed, it works the same on phones and
 * tablets, and screen readers get a single adjustable control.
 */
export function TimeStepper({ label, value, onChange }: TimeStepperProps) {
  const display = formatLocalTime12h(value);
  return (
    <View style={styles.container}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <View
        style={styles.control}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: display }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) =>
          onChange(shiftTime(value, event.nativeEvent.actionName === 'increment' ? 1 : -1))
        }
      >
        <IconButton
          icon="remove"
          variant="ghost"
          accessibilityLabel={`${label} earlier`}
          onPress={() => onChange(shiftTime(value, -1))}
        />
        <Text variant="label" style={styles.value} numberOfLines={1}>
          {display}
        </Text>
        <IconButton
          icon="add"
          variant="ghost"
          accessibilityLabel={`${label} later`}
          onPress={() => onChange(shiftTime(value, 1))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 150, gap: spacing.xs },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
  },
  value: { flex: 1, textAlign: 'center' },
});
