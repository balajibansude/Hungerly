import {
  Badge,
  Button,
  colors,
  Icon,
  radius,
  Screen,
  screenGutter,
  spacing,
  Text,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { activeMembership, useSessionStore } from '@/features/auth/session';
import { useOnboardingStore } from '@/features/onboarding/draft';
import { stepNumber, TOTAL_STEPS } from '@/features/onboarding/steps';

/**
 * Step 7 — Registration complete. Lives with the workspace (not in onboarding), so once
 * the new membership exists the back button can never return to the registration flow.
 */
export default function RegistrationCompleteScreen() {
  const completed = useOnboardingStore((s) => s.completed);
  const acknowledge = useOnboardingStore((s) => s.acknowledgeCompletion);
  const membershipName = useSessionStore((s) => activeMembership(s.session)?.restaurantName);
  const restaurantName = completed?.restaurantName ?? membershipName ?? 'Your restaurant';

  const enterWorkspace = () => {
    acknowledge();
    router.replace('/dashboard');
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <Text variant="label" color="primary">
            Step {stepNumber('complete')} of {TOTAL_STEPS}
          </Text>
          <View style={styles.hero}>
            <View style={styles.icon}>
              <Icon name="checkmark-circle" size="hero" color="success" />
            </View>
            <Text variant="h1" align="center" accessibilityRole="header">
              Registration complete
            </Text>
            <Text variant="h2" align="center" color="primary">
              {restaurantName}
            </Text>
            <Text variant="body" color="textSecondary" align="center">
              Your restaurant is set up and submitted to Hungerly for review. Explore your workspace
              now — you can go online once it’s approved.
            </Text>
            <Badge label="In review" tone="warning" icon="time-outline" />
          </View>
        </View>
        <View style={styles.spacer} />
        <View style={styles.column}>
          <Button
            label="Continue to workspace"
            icon="arrow-forward"
            iconPosition="end"
            onPress={enterWorkspace}
            fullWidth
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: screenGutter,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.lg,
  },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.md, paddingTop: spacing['3xl'] },
  icon: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.successSoft,
    marginBottom: spacing.sm,
  },
  spacer: { flex: 1, minHeight: spacing['2xl'] },
});
