import {
  Badge,
  Button,
  Card,
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

import { useSessionStore } from '@/features/auth/session';
import { useSignOut } from '@/features/auth/useSignOut';
import { branchStatusMeta } from '@/features/branch/status';
import { useMutation } from '@/lib/hooks';

/**
 * Shown while the owner's restaurant is submitted and waiting for admin review, and no
 * branch has been approved yet. The dashboard opens once an administrator approves it.
 */
export default function PendingApprovalScreen() {
  const session = useSessionStore((s) => s.session);
  const reload = useSessionStore((s) => s.reload);
  const { signOut, signingOut } = useSignOut();
  const branch = session?.branches.find((b) => b.status === 'pending_review') ?? null;
  const meta = branchStatusMeta.pending_review;

  // Re-reads /partner/me; the startup gate then routes to the dashboard once approved.
  const { run: checkStatus, pending: checking, error } = useMutation(async () => {
    await reload();
    router.replace('/');
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="hourglass-outline" size="xl" color="primary" />
          </View>
          <Text variant="h1" accessibilityRole="header">
            Waiting for approval
          </Text>
          <Text variant="body" color="textSecondary">
            Your registration has been submitted. Our team will verify your details and notify you
            within 1–2 business days.
          </Text>
        </View>

        {branch && (
          <Card style={styles.card}>
            <Text variant="label">{branch.name}</Text>
            {(branch.locality || branch.city) && (
              <Text variant="bodySmall" color="textSecondary">
                {[branch.locality, branch.city].filter(Boolean).join(', ')}
              </Text>
            )}
            <Badge label={meta.label} tone={meta.tone} />
            <Text variant="bodySmall" color="textSecondary">
              {meta.hint}
            </Text>
          </Card>
        )}

        <View style={styles.spacer} />

        {error && (
          <Text variant="bodySmall" color="error" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        )}
        <Button
          label="Check status"
          icon="refresh"
          onPress={() => checkStatus()}
          loading={checking}
          fullWidth
        />
        <Button
          label="Use a different account"
          variant="outline"
          icon="log-out-outline"
          onPress={signOut}
          loading={signingOut}
          fullWidth
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingHorizontal: screenGutter,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.lg,
  },
  hero: { gap: spacing.sm },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.sm,
  },
  card: { gap: spacing.sm, padding: spacing.lg },
  spacer: { flex: 1, minHeight: spacing.lg },
});
