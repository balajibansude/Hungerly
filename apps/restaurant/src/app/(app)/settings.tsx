import { PartnerSessionSchema, paths } from '@hungerly/api-client';
import { Button, Card, Screen, ScreenHeader, screenGutter, spacing, Text, TextField } from '@hungerly/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';

import { useSessionStore } from '@/features/auth/session';
import { fieldErrors } from '@/lib/errors';
import { request, useMutation } from '@/lib/hooks';

/** Account settings. Push notifications are not set up yet, and the screen says so plainly. */
export default function SettingsScreen() {
  const user = useSessionStore((s) => s.session?.user);
  const reload = useSessionStore((s) => s.reload);
  const [name, setName] = useState(user?.fullName ?? '');
  const [saved, setSaved] = useState(false);
  const save = useMutation(async () => {
    await request('PATCH', paths.partner.me, PartnerSessionSchema, { fullName: name.trim() });
    await reload();
    setSaved(true);
  });
  const nameError = fieldErrors(save.rawError).fullName ?? save.error ?? undefined;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Settings & notifications" onBack={() => router.back()} />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="h3" accessibilityRole="header">
            Your name
          </Text>
          <TextField
            label="Full name"
            value={name}
            onChangeText={(text) => {
              setName(text);
              setSaved(false);
            }}
            autoCapitalize="words"
            maxLength={80}
            errorText={nameError}
          />
          <Button
            label={saved ? 'Saved' : 'Save name'}
            onPress={() => save.run()}
            loading={save.pending}
            disabled={name.trim().length < 2 || name.trim() === (user?.fullName ?? '')}
          />

          <Text variant="h3" accessibilityRole="header" style={styles.section}>
            Notifications
          </Text>
          <Card style={styles.card}>
            <Text variant="label">New-order alerts</Text>
            <Text variant="bodySmall" color="textSecondary">
              Push notifications are not set up in this version. Keep the Orders tab open during
              service; it refreshes when you return to the app.
            </Text>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'], gap: spacing.md },
  section: { marginTop: spacing.lg },
  card: { gap: spacing.xs },
});
