import { Button, Screen, screenGutter, spacing, Text, TextField } from '@hungerly/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { useSessionStore } from '@/features/auth/session';
import { useServices, userMessage } from '@/services';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shown once, after a first-time sign-in. */
export default function ProfileSetupScreen() {
  const { auth } = useServices();
  const session = useSessionStore((s) => s.session);
  const updateUser = useSessionStore((s) => s.updateUser);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const emailInvalid = email.trim().length > 0 && !EMAIL.test(email.trim());

  const save = async () => {
    if (!trimmedName || emailInvalid) return;
    setSaving(true);
    setError(null);
    try {
      const user = await auth.updateProfile({
        fullName: trimmedName,
        email: email.trim() || undefined,
      });
      updateUser(user);
      router.replace('/');
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    if (session) updateUser(session.user);
    router.replace('/');
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="h1" accessibilityRole="header">
              What should we call you?
            </Text>
            <Text variant="body" color="textSecondary">
              Your name helps restaurants and delivery partners recognise your order.
            </Text>
          </View>

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
            label="Continue"
            onPress={save}
            loading={saving}
            disabled={!trimmedName || emailInvalid}
            fullWidth
          />
          <Button label="Skip for now" onPress={skip} variant="ghost" fullWidth />
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
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  spacer: { flex: 1, minHeight: spacing['2xl'] },
});
