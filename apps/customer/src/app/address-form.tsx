import { useQuery } from '@hungerly/app-core';
import {
  Button,
  Chip,
  ErrorState,
  LoadingState,
  Screen,
  ScreenHeader,
  screenGutter,
  spacing,
  Text,
  TextField,
} from '@hungerly/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ADDRESS_LABELS, addressLabels } from '@/features/addresses/format';
import { saveAddressAndMaybeSelect } from '@/features/addresses/saveAndSelect';
import {
  ADDRESS_LIMITS,
  emptyAddressDraft,
  validateAddress,
  type AddressDraft,
  type AddressField,
} from '@/features/addresses/validation';
import { useServices, userMessage } from '@/services';

/**
 * Add an address, or edit one with `?id=`. Signed-in only (guarded in the root layout).
 * `?select=1` (opened from checkout): a new address becomes the delivery address and the
 * customer goes straight back to the cart.
 */
export default function AddressFormScreen() {
  const { location } = useServices();
  const { id, select } = useLocalSearchParams<{ id?: string; select?: string }>();
  const selectAfterSave = select === '1';
  const saved = useQuery(`address-form:${id ?? 'new'}`, () => location.listAddresses());

  if (!id) return <AddressForm initial={emptyAddressDraft} selectAfterSave={selectAfterSave} />;
  if (saved.status === 'loading') return <LoadingState label="Loading address" />;
  const existing =
    saved.status === 'success' ? saved.data.addresses.find((a) => a.id === id) : undefined;
  if (!existing) {
    return (
      <Screen>
        <ScreenHeader title="Edit address" onBack={() => router.back()} />
        <ErrorState
          message={
            saved.status === 'error'
              ? "We couldn't load this address."
              : 'This address no longer exists.'
          }
          onRetry={saved.refetch}
        />
      </Screen>
    );
  }
  return (
    <AddressForm
      id={id}
      initial={{
        label: existing.label,
        line1: existing.line1,
        line2: existing.line2 ?? '',
        landmark: existing.landmark ?? '',
        locality: existing.locality,
        city: existing.city,
        postalCode: existing.postalCode,
      }}
    />
  );
}

function AddressForm({
  id,
  initial,
  selectAfterSave = false,
}: {
  id?: string;
  initial: AddressDraft;
  selectAfterSave?: boolean;
}) {
  const { location } = useServices();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<AddressField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: AddressField) => (value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    // Clear a field's message as soon as the customer starts fixing it.
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const save = async () => {
    if (saving) return;
    const result = validateAddress(draft);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { selected } = await saveAddressAndMaybeSelect({
        location,
        input: { ...result.value, id },
        selectAfterSave,
      });
      // Selected for checkout: return to the cart (past the picker, if it was opened from
      // there). Otherwise go back as usual, e.g. to the picker to choose it by hand.
      if (selected) router.dismissTo('/cart');
      else router.back();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['top']}>
      <ScreenHeader title={id ? 'Edit address' : 'Add address'} onBack={() => router.back()} />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.group}>
            <Text variant="label" color="textSecondary">
              Save as
            </Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {ADDRESS_LABELS.map((label) => (
                <Chip
                  key={label}
                  label={addressLabels[label].title}
                  icon={addressLabels[label].icon}
                  selected={draft.label === label}
                  onPress={() => setDraft((d) => ({ ...d, label }))}
                />
              ))}
            </View>
          </View>

          <TextField
            label="Flat, house no., building *"
            value={draft.line1}
            onChangeText={set('line1')}
            errorText={errors.line1}
            maxLength={ADDRESS_LIMITS.line1.max}
            autoCapitalize="words"
            testID="address-line1"
          />
          <TextField
            label="Street, road or area (optional)"
            value={draft.line2}
            onChangeText={set('line2')}
            errorText={errors.line2}
            maxLength={ADDRESS_LIMITS.line2.max}
            autoCapitalize="words"
          />
          <TextField
            label="Landmark (optional)"
            placeholder="E.g. near the city mall"
            value={draft.landmark}
            onChangeText={set('landmark')}
            errorText={errors.landmark}
            maxLength={ADDRESS_LIMITS.landmark.max}
            autoCapitalize="sentences"
          />
          <TextField
            label="Locality *"
            value={draft.locality}
            onChangeText={set('locality')}
            errorText={errors.locality}
            maxLength={ADDRESS_LIMITS.locality.max}
            autoCapitalize="words"
            testID="address-locality"
          />
          <View style={styles.pair}>
            <TextField
              label="City *"
              value={draft.city}
              onChangeText={set('city')}
              errorText={errors.city}
              maxLength={ADDRESS_LIMITS.city.max}
              autoCapitalize="words"
              containerStyle={styles.flex}
              testID="address-city"
            />
            <TextField
              label="PIN code *"
              value={draft.postalCode}
              onChangeText={set('postalCode')}
              errorText={errors.postalCode}
              keyboardType="number-pad"
              maxLength={6}
              containerStyle={styles.flex}
              testID="address-pin"
            />
          </View>

          {error && (
            <Text variant="bodySmall" color="error" accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button
            label={id ? 'Save changes' : 'Save address'}
            onPress={save}
            loading={saving}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing['2xl'], gap: spacing.lg },
  group: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  footer: { paddingHorizontal: screenGutter, paddingTop: spacing.md },
});
