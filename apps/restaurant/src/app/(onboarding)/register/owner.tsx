import { Card, Chip, Icon, spacing, Text, TextField } from '@hungerly/ui';
import { formatE164India } from '@hungerly/utils';
import { StyleSheet, View } from 'react-native';

import { useSessionStore } from '@/features/auth/session';
import { ChoiceGroup } from '@/features/onboarding/components/ChoiceGroup';
import { StepLayout } from '@/features/onboarding/components/StepLayout';
import { ROLE_OPTIONS } from '@/features/onboarding/options';
import { useStepForm } from '@/features/onboarding/useStepForm';

/** Step 2 — Owner or manager: the signed-in person's name and role at the restaurant. */
export default function OwnerStep() {
  const form = useStepForm('owner');
  const { fullName, role } = form.values;
  const user = useSessionStore((s) => s.session?.user);
  const signedInWith = user?.phoneE164 ? formatE164India(user.phoneE164) : (user?.email ?? '');

  return (
    <StepLayout
      step="owner"
      subtitle="You’ll be the first team member. You can invite others later."
      primary={form.primary}
      footerNote={form.footerNote}
    >
      <TextField
        label="Your full name"
        value={fullName}
        onChangeText={(value) => form.set({ fullName: value })}
        onBlur={() => form.touch('fullName')}
        placeholder="As on your ID"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="done"
        maxLength={80}
        errorText={form.errorFor('fullName')}
      />

      <ChoiceGroup
        label="Your role"
        helperText={ROLE_OPTIONS.find((o) => o.value === role)?.hint}
        errorText={form.errorFor('role')}
      >
        {ROLE_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={role === option.value}
            onPress={() => {
              form.touch('role');
              form.set({ role: option.value });
            }}
          />
        ))}
      </ChoiceGroup>

      <Card style={styles.identity}>
        <Icon name="shield-checkmark-outline" color="textSecondary" />
        <View style={styles.flex}>
          <Text variant="label">Account login</Text>
          <Text variant="bodySmall" color="textSecondary">
            You’ll keep signing in with {signedInWith}. Registration doesn’t change it.
          </Text>
        </View>
      </Card>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  identity: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, alignItems: 'center' },
});
