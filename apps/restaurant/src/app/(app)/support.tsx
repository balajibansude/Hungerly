import { Button, Card, Screen, ScreenHeader, screenGutter, spacing, Text } from '@hungerly/ui';
import { router } from 'expo-router';
import { Linking, ScrollView, StyleSheet } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';

/** Support address configured per build (EXPO_PUBLIC_SUPPORT_EMAIL); never hard-coded. */
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? null;

export default function SupportScreen() {
  const { branch } = useActiveBranch();
  const subject = encodeURIComponent(`Partner support${branch ? ` · ${branch.name} (${branch.id.slice(0, 8)})` : ''}`);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Help & support" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Text variant="h3">Contact Swaadone partner support</Text>
          {SUPPORT_EMAIL ? (
            <>
              <Text variant="bodySmall" color="textSecondary">
                Write to {SUPPORT_EMAIL}. Include your branch name; never send your full bank
                account number or sign-in codes by email.
              </Text>
              <Button
                label="Email support"
                icon="mail-outline"
                onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`)}
              />
            </>
          ) : (
            <Text variant="bodySmall" color="textSecondary">
              The support contact has not been configured for this build yet
              (EXPO_PUBLIC_SUPPORT_EMAIL). Please contact your Swaadone onboarding manager.
            </Text>
          )}
        </Card>
        <Card style={styles.card}>
          <Text variant="h3">Common questions</Text>
          <Text variant="label">Why can’t my branch take orders?</Text>
          <Text variant="bodySmall" color="textSecondary">
            A branch takes orders only when Swaadone has approved it, it is switched online and it
            is within its opening hours. Home shows the exact reason.
          </Text>
          <Text variant="label">When can I withdraw earnings?</Text>
          <Text variant="bodySmall" color="textSecondary">
            Earnings become available after the settlement hold, once your bank account is verified.
            Wallet shows what is available and anything blocking a withdrawal.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'], gap: spacing.lg },
  card: { gap: spacing.sm },
});
