import { BusinessSchema, paths, UpsertBusinessSchema, type Business } from '@hungerly/api-client';
import {
  Button,
  Card,
  Screen,
  screenGutter,
  ScreenHeader,
  spacing,
  Text,
  TextField,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';

import { api } from '@/lib/api';
import { useApiQuery, useMutation } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';

const ENTITY_LABEL: Record<string, string> = {
  individual: 'Individual / Sole proprietor',
  partnership: 'Partnership',
  llp: 'Limited Liability Partnership (LLP)',
  company: 'Private / Public Company',
  other: 'Other',
};

function BusinessForm({ initial, onSaved }: { initial: Business; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [legalName, setLegalName] = useState(initial.legalName);
  const [gstin, setGstin] = useState(initial.gstin ?? '');

  const { run: save, pending, error: saveError } = useMutation(async () => {
    const result = UpsertBusinessSchema.safeParse({
      displayName: displayName.trim(),
      legalName: legalName.trim(),
      entityType: initial.entityType,
      gstin: gstin.trim() || null,
    });
    if (!result.success) {
      Alert.alert('Invalid details', result.error.issues[0]?.message ?? 'Check your input.');
      return;
    }
    await api.request('PATCH', paths.partner.business, { schema: BusinessSchema, body: result.data });
    onSaved();
    Alert.alert('Saved', 'Business profile updated.');
  });

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.section}>
          <Text variant="h3">Business details</Text>
          <TextField
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Name shown to customers"
            helperText="This is the name customers see on the app"
          />
          <TextField
            label="Legal name"
            value={legalName}
            onChangeText={setLegalName}
            placeholder="Registered legal name"
          />
          <TextField
            label="GSTIN (optional)"
            value={gstin}
            onChangeText={(v) => setGstin(v.toUpperCase())}
            autoCapitalize="characters"
            placeholder="e.g. 27AAAPL1234C1Z5"
            helperText="15-character GST Identification Number"
          />
        </Card>

        <Card style={styles.section}>
          <Text variant="label" color="textSecondary">
            ENTITY TYPE
          </Text>
          <Text variant="body">
            {ENTITY_LABEL[initial.entityType] ?? initial.entityType}
          </Text>
          <Text variant="caption" color="textSecondary">
            Entity type cannot be changed. Contact support if this is incorrect.
          </Text>
        </Card>

        {saveError && (
          <Text variant="caption" color="error" align="center">
            {saveError}
          </Text>
        )}

        <Button label="Save changes" onPress={() => save()} loading={pending} fullWidth />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function BusinessProfileScreen() {
  const query = useApiQuery(paths.partner.business, BusinessSchema);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Business profile" />
      <QueryView query={query} loadingLabel="Loading profile">
        {(business) => (
          <BusinessForm initial={business} onSaved={() => query.refetch?.()} />
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  section: { padding: spacing.lg, gap: spacing.md },
});
