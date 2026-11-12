import { CouponInputSchema, CouponSchema, paths } from '@hungerly/api-client';
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
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

function toIso(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00+05:30`;
}

export default function NewCouponScreen() {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [percentBps, setPercentBps] = useState('');
  const [amountMinor, setAmountMinor] = useState('');
  const [minOrderRupees, setMinOrderRupees] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('23:59');

  const { run: create, pending, error: createError } = useMutation(async () => {
    const discount =
      discountType === 'percent'
        ? { type: 'percent' as const, percentBps: Math.round(parseFloat(percentBps) * 100), maxDiscountMinor: null }
        : { type: 'flat' as const, amountMinor: Math.round(parseFloat(amountMinor) * 100) };

    const input = {
      code: code.trim().toUpperCase(),
      title: title.trim(),
      description: description.trim(),
      discount,
      minOrderMinor: Math.round(parseFloat(minOrderRupees) * 100),
      startsAt: toIso(startDate, startTime),
      endsAt: toIso(endDate, endTime),
      branchIds: [],
      menuItemIds: [],
      usageLimitTotal: null,
      usageLimitPerCustomer: null,
    };

    const result = CouponInputSchema.safeParse(input);
    if (!result.success) {
      Alert.alert('Invalid details', result.error.issues[0]?.message ?? 'Check your input.');
      return;
    }

    await api.request('POST', paths.partner.coupons, { schema: CouponSchema, body: result.data });
    router.back();
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} title="Create coupon" />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.section}>
          <Text variant="h3">Coupon details</Text>
          <TextField
            label="Code"
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            placeholder="e.g. SAVE20"
            helperText="4-15 letters or digits"
          />
          <TextField
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. 20% off your order"
          />
          <TextField
            label="Description (optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="Terms or short description"
            multiline
          />
        </Card>

        <Card style={styles.section}>
          <Text variant="h3">Discount</Text>
          <View style={styles.typeRow}>
            <Button
              label="Percentage"
              variant={discountType === 'percent' ? 'primary' : 'outline'}
              onPress={() => setDiscountType('percent')}
              style={styles.typeBtn}
            />
            <Button
              label="Flat amount"
              variant={discountType === 'flat' ? 'primary' : 'outline'}
              onPress={() => setDiscountType('flat')}
              style={styles.typeBtn}
            />
          </View>
          {discountType === 'percent' ? (
            <TextField
              label="Discount (%)"
              value={percentBps}
              onChangeText={setPercentBps}
              keyboardType="decimal-pad"
              placeholder="e.g. 20"
              helperText="Enter 20 for 20% off"
            />
          ) : (
            <TextField
              label="Discount amount (₹)"
              value={amountMinor}
              onChangeText={setAmountMinor}
              keyboardType="decimal-pad"
              placeholder="e.g. 50"
            />
          )}
          <TextField
            label="Minimum order (₹)"
            value={minOrderRupees}
            onChangeText={setMinOrderRupees}
            keyboardType="decimal-pad"
            placeholder="e.g. 200"
          />
        </Card>

        <Card style={styles.section}>
          <Text variant="h3">Validity period</Text>
          <TextField
            label="Start date (YYYY-MM-DD)"
            value={startDate}
            onChangeText={setStartDate}
            keyboardType="numeric"
            placeholder="2025-01-01"
          />
          <TextField
            label="Start time (HH:MM)"
            value={startTime}
            onChangeText={setStartTime}
            keyboardType="numeric"
            placeholder="00:00"
          />
          <TextField
            label="End date (YYYY-MM-DD)"
            value={endDate}
            onChangeText={setEndDate}
            keyboardType="numeric"
            placeholder="2025-01-31"
          />
          <TextField
            label="End time (HH:MM)"
            value={endTime}
            onChangeText={setEndTime}
            keyboardType="numeric"
            placeholder="23:59"
          />
        </Card>

        {createError && (
          <Text variant="caption" color="error" align="center">
            {createError}
          </Text>
        )}

        <Button
          label="Create coupon"
          onPress={() => create()}
          loading={pending}
          fullWidth
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  section: { padding: spacing.lg, gap: spacing.md },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeBtn: { flex: 1 },
});
