import { PayoutAccountResponseSchema, paths, SetPayoutAccountSchema } from '@hungerly/api-client';
import {
  Badge,
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
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { api } from '@/lib/api';
import { useApiQuery, useMutation } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { formatIstDateTime } from '@/features/wallet/format';

const STATUS_META = {
  pending_verification: { label: 'Pending verification', tone: 'warning' as const },
  verification_in_progress: { label: 'Verifying', tone: 'info' as const },
  verified: { label: 'Verified', tone: 'success' as const },
  failed: { label: 'Verification failed', tone: 'error' as const },
  disabled: { label: 'Disabled', tone: 'neutral' as const },
};

export default function PayoutAccountScreen() {
  const { branchId } = useActiveBranch();
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [showForm, setShowForm] = useState(false);

  const query = useApiQuery(
    branchId ? paths.partner.payoutAccount(branchId) : null,
    PayoutAccountResponseSchema,
  );

  const { run: saveAccount, pending, error: saveError } = useMutation(async () => {
    if (!branchId) return;
    const result = SetPayoutAccountSchema.safeParse({
      accountHolderName,
      accountNumber,
      confirmAccountNumber,
      ifsc,
    });
    if (!result.success) {
      Alert.alert('Invalid details', result.error.issues[0]?.message ?? 'Check your details.');
      return;
    }
    await api.request('PUT', paths.partner.payoutAccount(branchId), {
      schema: PayoutAccountResponseSchema,
      body: result.data,
    });
    query.refetch?.();
    setShowForm(false);
    Alert.alert('Saved', 'Your bank account details have been saved and will be verified shortly.');
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Bank account" />
      <QueryView query={query} loadingLabel="Loading account">
        {({ current, nextStep: step }) => (
          <ScrollView contentContainerStyle={styles.content}>
            {current ? (
              <Card style={styles.accountCard}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text variant="label">{current.accountHolderName}</Text>
                    <Text variant="bodySmall" color="textSecondary">
                      {current.ifsc} · ••••{current.accountNumberLast4}
                    </Text>
                    {current.verifiedAt && (
                      <Text variant="caption" color="textSecondary">
                        Verified {formatIstDateTime(current.verifiedAt)}
                      </Text>
                    )}
                    {current.registeredName && (
                      <Text variant="caption" color="textSecondary">
                        Bank name: {current.registeredName}
                      </Text>
                    )}
                    {current.failureReason && (
                      <Text variant="caption" color="error">
                        {current.failureReason}
                      </Text>
                    )}
                  </View>
                  <Badge
                    label={STATUS_META[current.status].label}
                    tone={STATUS_META[current.status].tone}
                  />
                </View>
                {step && (
                  <Text variant="caption" color="textSecondary">
                    {step}
                  </Text>
                )}
              </Card>
            ) : (
              <Card style={styles.emptyCard}>
                <Text variant="body" color="textSecondary" align="center">
                  No bank account added yet. Add one to enable withdrawals.
                </Text>
              </Card>
            )}

            {showForm ? (
              <Card style={styles.form}>
                <Text variant="h3">
                  {current ? 'Update bank account' : 'Add bank account'}
                </Text>
                <TextField
                  label="Account holder name"
                  value={accountHolderName}
                  onChangeText={setAccountHolderName}
                  placeholder="As on bank records"
                />
                <TextField
                  label="Account number"
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  keyboardType="numeric"
                  secureTextEntry
                />
                <TextField
                  label="Confirm account number"
                  value={confirmAccountNumber}
                  onChangeText={setConfirmAccountNumber}
                  keyboardType="numeric"
                />
                <TextField
                  label="IFSC code"
                  value={ifsc}
                  onChangeText={(v) => setIfsc(v.toUpperCase())}
                  autoCapitalize="characters"
                  placeholder="e.g. SBIN0001234"
                />
                {saveError && (
                  <Text variant="caption" color="error">
                    {saveError}
                  </Text>
                )}
                <View style={styles.actions}>
                  <Button
                    label="Cancel"
                    variant="outline"
                    onPress={() => setShowForm(false)}
                    style={styles.flex}
                  />
                  <Button
                    label="Save"
                    onPress={() => saveAccount()}
                    loading={pending}
                    style={styles.flex}
                  />
                </View>
              </Card>
            ) : (
              <Button
                label={current ? 'Update bank account' : 'Add bank account'}
                variant="outline"
                icon="card-outline"
                onPress={() => setShowForm(true)}
                fullWidth
              />
            )}
          </ScrollView>
        )}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  accountCard: { padding: spacing.lg, gap: spacing.sm },
  emptyCard: { padding: spacing.xl, alignItems: 'center' },
  form: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
