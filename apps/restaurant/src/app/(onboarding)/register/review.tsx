import { Button, Card, colors, Divider, Icon, spacing, Text } from '@hungerly/ui';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { StepLayout } from '@/features/onboarding/components/StepLayout';
import { useOnboardingStore } from '@/features/onboarding/draft';
import { reviewSections } from '@/features/onboarding/review';
import { stepForSection } from '@/features/onboarding/steps';
import { submitRegistration } from '@/features/onboarding/submit';
import { useServices } from '@/services';

/**
 * Step 6 — Review. Read-only: every value with an Edit action per section. Completing
 * re-validates the whole draft; problems send the user to the first invalid step.
 */
export default function ReviewStep() {
  const { onboarding } = useServices();
  const draft = useOnboardingStore((s) => s.draft);
  const submission = useOnboardingStore((s) => s.submission);
  const submitting = submission.status === 'submitting';
  const sections = reviewSections(draft);

  const complete = async () => {
    const outcome = await submitRegistration(onboarding);
    if (outcome.kind === 'invalid') {
      router.push({
        pathname: stepForSection(outcome.section).href,
        params: { from: 'review', showErrors: '1' },
      });
    } else if (outcome.kind === 'submitted') {
      // The new membership opens the workspace; the gate shows the completion screen first.
      router.replace('/');
    }
  };

  return (
    <StepLayout
      step="review"
      subtitle="Check everything before you register. You can edit any section."
      primary={{
        label: submission.status === 'failed' ? 'Try again' : 'Complete registration',
        onPress: complete,
        loading: submitting,
        disabled: submitting,
        icon: 'checkmark-circle-outline',
      }}
      footerNote="Your restaurant will be submitted to Hungerly for review."
    >
      {submission.status === 'failed' && (
        <Card style={styles.error}>
          <Icon name="alert-circle-outline" color="error" />
          <View style={styles.flex}>
            <Text variant="label" color="error">
              Registration didn’t go through
            </Text>
            <Text variant="bodySmall" color="textSecondary" accessibilityLiveRegion="assertive">
              {submission.message} Your details are saved — try again.
            </Text>
          </View>
        </Card>
      )}

      {sections.map((section) => (
        <Card key={section.section} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text variant="h3" accessibilityRole="header" style={styles.flex}>
              {section.title}
            </Text>
            <Button
              label="Edit"
              variant="ghost"
              icon="create-outline"
              disabled={submitting}
              accessibilityLabel={`Edit ${section.title}`}
              onPress={() =>
                router.push({ pathname: section.editHref, params: { from: 'review' } })
              }
            />
          </View>
          <Divider />
          <View style={styles.rows}>
            {section.rows.map((row) => (
              <View
                key={row.label}
                style={styles.row}
                accessible
                accessibilityLabel={`${row.label}: ${row.value}`}
              >
                <Text variant="bodySmall" color="textSecondary" style={styles.label}>
                  {row.label}
                </Text>
                <Text variant="body" style={styles.value}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ))}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { paddingBottom: spacing.sm },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  rows: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xxs },
  label: { flexBasis: 140, flexGrow: 0, paddingTop: 2 },
  value: { flex: 1, minWidth: 160 },
  error: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
});
