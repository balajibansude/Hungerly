import { paths, RequestPayoutSchema, WalletSchema } from '@hungerly/api-client';
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
import { formatMoney } from '@hungerly/utils';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { randomUUID } from 'expo-crypto';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { api } from '@/lib/api';
import { useApiQuery, useMutation } from '@/lib/hooks';
import { QueryView } from '@/features/shell/ScreenState';
import { checkWithdrawAmount } from '@/features/payouts/withdraw';

export default function WithdrawScreen() {
  const { branchId } = useActiveBranch();
  const [amountInput, setAmountInput] = useState('');
  const walletQuery = useApiQuery(
    branchId ? paths.partner.wallet(branchId) : null,
    WalletSchema,
  );

  const { run: requestPayout, pending } = useMutation(async (amountMinor: number) => {
    if (!branchId) return;
    const idempotencyKey = randomUUID();
    await api.request('POST', paths.partner.payouts(branchId), {
      schema: RequestPayoutSchema,
      body: { amountMinor },
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    Alert.alert(
      'Withdrawal requested',
      'Your payout will be processed within 1–2 business days.',
      [{ text: 'OK', onPress: () => router.back() }],
    );
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Withdraw earnings" />
      <QueryView query={walletQuery} loadingLabel="Loading wallet">
        {(wallet) => {
          const check = checkWithdrawAmount(amountInput, {
            availableMinor: wallet.available.amountMinor,
            minimumMinor: wallet.minimumWithdrawal.amountMinor,
          });

          return (
            <ScrollView contentContainerStyle={styles.content}>
              <Card style={styles.balanceCard}>
                <Text variant="label" color="textSecondary">
                  AVAILABLE
                </Text>
                <Text variant="display">{formatMoney(wallet.available)}</Text>
                <Text variant="caption" color="textSecondary">
                  Minimum withdrawal: {formatMoney(wallet.minimumWithdrawal)}
                </Text>
              </Card>

              {wallet.payoutAccount && (
                <Card style={styles.accountCard}>
                  <Text variant="label" color="textSecondary">
                    TO ACCOUNT
                  </Text>
                  <Text variant="body">
                    {wallet.payoutAccount.accountHolderName}
                  </Text>
                  <Text variant="bodySmall" color="textSecondary">
                    {wallet.payoutAccount.ifsc} · ••••{wallet.payoutAccount.accountNumberLast4}
                  </Text>
                </Card>
              )}

              <View style={styles.formSection}>
                <TextField
                  label="Amount (₹)"
                  value={amountInput}
                  onChangeText={setAmountInput}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 1500"
                  errorText={
                    amountInput && !check.ok ? check.message : undefined
                  }
                />
                <Button
                  label="Withdraw"
                  icon="arrow-up-circle-outline"
                  onPress={() => {
                    if (check.ok) requestPayout(check.amountMinor);
                  }}
                  disabled={!check.ok}
                  loading={pending}
                  fullWidth
                />
              </View>

              <Text variant="caption" color="textSecondary" align="center">
                Payouts are processed within 1–2 business days. The exact amount is subject to
                final settlement at the time of processing.
              </Text>
            </ScrollView>
          );
        }}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  balanceCard: { padding: spacing.lg, gap: spacing.xs },
  accountCard: { padding: spacing.lg, gap: spacing.xs },
  formSection: { gap: spacing.md },
});
