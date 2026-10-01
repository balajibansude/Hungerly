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
import { ScrollView, StyleSheet, View } from 'react-native';

import { useSessionStore } from '@/features/auth/session';
import { useSignOut } from '@/features/auth/useSignOut';

/** What registration will ask for (R3), so owners can get it ready. */
const steps: { icon: IconName; title: string; detail: string }[] = [
  {
    icon: 'storefront-outline',
    title: 'Restaurant details',
    detail: 'Name, cuisines, veg or mixed',
  },
  { icon: 'person-outline', title: 'Owner or manager', detail: 'Who we contact about the account' },
  { icon: 'location-outline', title: 'Address', detail: 'Where riders pick up orders' },
  { icon: 'call-outline', title: 'Contact', detail: 'Phone and email for customers and support' },
  { icon: 'time-outline', title: 'Operations', detail: 'Opening hours, prep time, minimum order' },
];

/** Entry to onboarding for an account that does not belong to any restaurant yet. */
export default function WelcomeScreen() {
  const user = useSessionStore((s) => s.session?.user);
  const { signOut, signingOut } = useSignOut();
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

        <Badge
          tone="warning"
          icon="flask-outline"
          label="Prototype: registration steps arrive in the next build"
        />

        <View style={styles.spacer} />

        <Text variant="bodySmall" color="textTertiary" align="center">
          Signed in as {signedInAs}
        </Text>
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
  flex: { flex: 1 },
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
