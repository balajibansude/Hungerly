import { Button, Card, Chip, Divider, spacing, Text, TextField } from '@hungerly/ui';
import { StyleSheet, View } from 'react-native';

import { ChoiceGroup } from '@/features/onboarding/components/ChoiceGroup';
import { DayHoursRow } from '@/features/onboarding/components/DayHoursRow';
import { StepLayout } from '@/features/onboarding/components/StepLayout';
import { useOnboardingStore } from '@/features/onboarding/draft';
import { PREP_MINUTES_OPTIONS } from '@/features/onboarding/options';
import { useStepForm } from '@/features/onboarding/useStepForm';

/**
 * Step 5 — Operations: one opening slot per weekday (late nights may run past midnight),
 * average preparation time and minimum order. Split shifts are edited later in Hours.
 */
export default function OperationsStep() {
  const form = useStepForm('operations');
  const { hours, avgPrepMinutes, minimumOrder } = form.values;
  const setDayHours = useOnboardingStore((s) => s.setDayHours);
  const applyHoursToAllDays = useOnboardingStore((s) => s.applyHoursToAllDays);

  return (
    <StepLayout
      step="operations"
      subtitle="When you take orders and how long food usually takes."
      primary={form.primary}
      footerNote={form.footerNote}
    >
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text variant="h3" accessibilityRole="header" style={styles.flex}>
            Opening hours
          </Text>
          <Button
            label="Copy Monday to all"
            variant="ghost"
            icon="copy-outline"
            onPress={() => applyHoursToAllDays(0)}
            accessibilityHint="Uses Monday's hours for every day"
          />
        </View>
        <Card style={styles.days}>
          {hours.map((day, index) => (
            <View key={day.dayOfWeek}>
              {index > 0 && <Divider />}
              <DayHoursRow
                day={day}
                errorText={form.errors[`hours.${day.dayOfWeek}`]}
                onChange={(patch) => setDayHours(day.dayOfWeek, patch)}
              />
            </View>
          ))}
        </Card>
        {form.errors.hours && (
          <Text variant="bodySmall" color="error" accessibilityLiveRegion="polite">
            {form.errors.hours}
          </Text>
        )}
      </View>

      <ChoiceGroup
        label="Average preparation time"
        helperText="Used for delivery estimates. You set the exact time when accepting each order."
        errorText={form.errorFor('avgPrepMinutes')}
      >
        {PREP_MINUTES_OPTIONS.map((minutes) => (
          <Chip
            key={minutes}
            label={`${minutes} min`}
            selected={avgPrepMinutes === minutes}
            onPress={() => {
              form.touch('avgPrepMinutes');
              form.set({ avgPrepMinutes: minutes });
            }}
          />
        ))}
      </ChoiceGroup>

      <TextField
        label="Minimum order"
        value={minimumOrder}
        onChangeText={(value) => form.set({ minimumOrder: value })}
        onBlur={() => form.touch('minimumOrder')}
        keyboardType="decimal-pad"
        returnKeyType="done"
        maxLength={10}
        placeholder="0"
        helperText="Smallest order customers can place. Enter 0 for no minimum."
        errorText={form.errorFor('minimumOrder')}
        leading={
          <Text variant="bodyLarge" color="textSecondary">
            ₹
          </Text>
        }
        containerStyle={styles.amount}
      />
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  days: { paddingHorizontal: spacing.lg },
  amount: { maxWidth: 260 },
});
