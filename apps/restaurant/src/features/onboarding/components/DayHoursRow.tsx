import { Badge, spacing, Switch, Text } from '@hungerly/ui';
import { crossesMidnight } from '@hungerly/utils';
import { StyleSheet, View } from 'react-native';

import { DAY_NAMES } from '@/services/registrationRules';

import type { DayHoursDraft } from '../draft';
import { TimeStepper } from './TimeStepper';

export interface DayHoursRowProps {
  day: DayHoursDraft;
  errorText?: string;
  onChange: (patch: Partial<Omit<DayHoursDraft, 'dayOfWeek'>>) => void;
}

/** One weekday: open/closed switch, and opening/closing times when open. */
export function DayHoursRow({ day, errorText, onChange }: DayHoursRowProps) {
  const name = DAY_NAMES[day.dayOfWeek];
  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text variant="label" style={styles.flex}>
          {name}
        </Text>
        <Text variant="bodySmall" color="textSecondary">
          {day.isOpen ? 'Open' : 'Closed'}
        </Text>
        <Switch
          value={day.isOpen}
          onValueChange={(isOpen) => onChange({ isOpen })}
          accessibilityLabel={`Open on ${name}`}
        />
      </View>
      {day.isOpen && (
        <>
          <View style={styles.times}>
            <TimeStepper
              label={`Opens ${name}`}
              value={day.opensAt}
              onChange={(opensAt) => onChange({ opensAt })}
            />
            <TimeStepper
              label={`Closes ${name}`}
              value={day.closesAt}
              onChange={(closesAt) => onChange({ closesAt })}
            />
          </View>
          {crossesMidnight(day) && (
            <Badge label="Closes after midnight" tone="info" icon="moon-outline" />
          )}
        </>
      )}
      {errorText && (
        <Text variant="bodySmall" color="error" accessibilityLiveRegion="polite">
          {errorText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { gap: spacing.sm, paddingVertical: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
