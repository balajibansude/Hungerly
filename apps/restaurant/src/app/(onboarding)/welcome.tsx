import { BranchDetailSchema, paths } from '@hungerly/api-client';
import {
  Badge,
  Button,
  Card,
  colors,
  Divider,
  Icon,
  radius,
  Screen,
  screenGutter,
  spacing,
  Text,
  type IconName,
} from '@hungerly/ui';
import { formatE164India } from '@hungerly/utils';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { resumableBranch, useSessionStore } from '@/features/auth/session';
import { useSignOut } from '@/features/auth/useSignOut';
import { branchStatusMeta } from '@/features/branch/status';
import { useApiQuery } from '@/lib/hooks';

/** What the registration wizard will ask for, shown so owners can prepare. The menu is added later from the dashboard. */
const steps: { icon: IconName; title: string; detail: string }[] = [
  { icon: 'storefront-outline', title: 'Restaurant details', detail: 'Name, cuisines, food type, logo' },
  { icon: 'person-outline', title: 'Owner information', detail: 'Name, email and role' },
  { icon: 'location-outline', title: 'Address', detail: 'Restaurant location and delivery radius' },
  { icon: 'time-outline', title: 'Operations', detail: 'Opening hours, services and prep time' },
  { icon: 'document-text-outline', title: 'Business verification', detail: 'FSSAI licence, PAN, GSTIN' },
  { icon: 'card-outline', title: 'Bank & payout', detail: 'Account details for payouts' },
  { icon: 'checkmark-done-outline', title: 'Review & submit', detail: 'Check your details and submit for approval' },
];

/** Entry to onboarding for an account that does not belong to any restaurant yet. */
export default function WelcomeScreen() {
  const user = useSessionStore((s) => s.session?.user);
  // An existing draft or rejected branch: registration continues with it (no duplicate branch).
  const existing = useSessionStore((s) => resumableBranch(s.session));
  const { signOut, signingOut } = useSignOut();
  // Only rejected branches need the detail: it carries the admin's rejection reason.
  const detail = useApiQuery(
    existing?.status === 'rejected' ? paths.partner.branch(existing.id) : null,
    BranchDetailSchema,
  );
  const rejectionReason = detail.status === 'success' ? detail.data.branch.statusReason : null;

  const begin = () => {
    router.push('/register');
  };
  const signedInAs = user?.phoneE164 ? formatE164India(user.phoneE164) : (user?.email ?? '');

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="storefront" size="xl" color="primary" />
          </View>
          <Text variant="h1" accessibilityRole="header">
            Welcome to Hungerly Partner
          </Text>
          <Text variant="body" color="textSecondary">
            Register your restaurant to start receiving orders. You’ll need a few details — most
            owners finish in about 10 minutes.
          </Text>
        </View>

        {existing && (
          <Card style={styles.resumeCard}>
            <Text variant="label">{existing.name}</Text>
            <Badge
              label={branchStatusMeta[existing.status].label}
              tone={branchStatusMeta[existing.status].tone}
            />
            <Text variant="bodySmall" color="textSecondary">
              {branchStatusMeta[existing.status].hint}
            </Text>
            {rejectionReason && (
              <Text variant="bodySmall" color="error" accessibilityLabel={`Review note: ${rejectionReason}`}>
                Review note: {rejectionReason}
              </Text>
            )}
          </Card>
        )}

        <Card>
          {steps.map((step, index) => (
            <View key={step.title}>
              {index > 0 && <Divider />}
              <View
                style={styles.step}
                accessible
                accessibilityLabel={`${step.title}: ${step.detail}`}
              >
                <Icon name={step.icon} color="textSecondary" />
                <View style={styles.flex}>
                  <Text variant="label">{step.title}</Text>
                  <Text variant="bodySmall" color="textSecondary">
                    {step.detail}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </Card>

        <View style={styles.spacer} />

        <Button
          label={existing ? 'Continue registration' : 'Start registration'}
          icon="arrow-forward"
          iconPosition="end"
          onPress={begin}
          fullWidth
        />

        <Text variant="bodySmall" color="textTertiary" align="center">
          Signed in as {signedInAs}
        </Text>
        <Button
          label="Sign out and go to login"
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
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingHorizontal: screenGutter,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.lg,
  },
  hero: { gap: spacing.sm },
  resumeCard: { gap: spacing.sm, padding: spacing.lg },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.sm,
  },
  step: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  spacer: { flex: 1, minHeight: spacing.lg },
});
