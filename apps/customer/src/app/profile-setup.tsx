import { Button, Screen, ScreenHeader, screenGutter, spacing, Text, TextField } from '@hungerly/ui';
import { Redirect, router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { useSessionStore } from '@/features/auth/session';
import { useServices, userMessage } from '@/services';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns to the screen the customer started from (e.g. the cart), or Home. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Two modes on one form:
 * - setup: shown once after a first-time sign-in, before the customer is signed in to the app;
 * - edit: "Edit profile" from the Account tab.
 */
export default function ProfileSetupScreen() {
  const { auth } = useServices();
  const pendingSession = useSessionStore((s) => s.pendingSession);
  const session = useSessionStore((s) => s.session);
  const signIn = useSessionStore((s) => s.signIn);
  const updateUser = useSessionStore((s) => s.updateUser);
  const isSetup = pendingSession !== null;
  const user = (pendingSession ?? session)?.user;

  const [name, setName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <Redirect href="/home" />;

  const trimmedName = name.trim();
  const emailInvalid = email.trim().length > 0 && !EMAIL.test(email.trim());

  const save = async () => {
    if (!trimmedName || emailInvalid) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await auth.updateProfile({
        fullName: trimmedName,
        email: email.trim() || undefined,
      });
      if (pendingSession) signIn({ ...pendingSession, user: updated, isNewUser: false });
      else updateUser(updated);
      leave();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    if (pendingSession) signIn({ ...pendingSession, isNewUser: false });
    leave();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      {/* First-time setup must end with Continue or Skip, so the sign-in completes. */}
      <Stack.Screen options={{ gestureEnabled: !isSetup }} />
      {!isSetup && <ScreenHeader title="Edit profile" onBack={() => router.back()} />}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, !isSetup && styles.editContent]}
          keyboardShouldPersistTaps="handled"
        >
          {isSetup && (
            <View style={styles.header}>
              <Text variant="h1" accessibilityRole="header">
                What should we call you?
              </Text>
              <Text variant="body" color="textSecondary">
                Your name helps restaurants and delivery partners recognise your order.
              </Text>
            </View>
          )}

          <TextField
            label="Full name"
            value={name}
            onChangeText={setName}
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            returnKeyType="next"
            placeholder="Aarav Kulkarni"
          />
          <TextField
            label="Email (optional)"
            value={email}
            onChangeText={setEmail}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@example.com"
            helperText="For receipts. We never share it."
            errorText={emailInvalid ? 'Enter a valid email address' : (error ?? undefined)}
          />

          <View style={styles.spacer} />
          <Button
            label={isSetup ? 'Continue' : 'Save changes'}
            onPress={save}
            loading={saving}
            disabled={!trimmedName || emailInvalid}
            fullWidth
          />
          {isSetup && <Button label="Skip for now" onPress={skip} variant="ghost" fullWidth />}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    gap: spacing.lg,
    paddingHorizontal: screenGutter,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.lg,
  },
  editContent: { paddingTop: spacing.sm },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  spacer: { flex: 1, minHeight: spacing['2xl'] },
});
