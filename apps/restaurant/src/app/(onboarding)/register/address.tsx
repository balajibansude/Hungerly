import { spacing, TextField } from '@hungerly/ui';
import { StyleSheet, View } from 'react-native';

import { StepLayout } from '@/features/onboarding/components/StepLayout';
import { useStepForm } from '@/features/onboarding/useStepForm';

/** Step 3 — Address. Plain text fields; the map pin arrives with maps in a later phase. */
export default function AddressStep() {
  const form = useStepForm('address');
  const { line1, locality, city, state, postalCode } = form.values;

  return (
    <StepLayout
      step="address"
      subtitle="Where riders collect orders."
      primary={form.primary}
      footerNote={form.footerNote}
    >
      <TextField
        label="Address"
        value={line1}
        onChangeText={(value) => form.set({ line1: value })}
        onBlur={() => form.touch('line1')}
        placeholder="Shop number, building, street"
        autoComplete="street-address"
        textContentType="streetAddressLine1"
        maxLength={120}
        errorText={form.errorFor('line1')}
      />
      <TextField
        label="Area / locality"
        value={locality}
        onChangeText={(value) => form.set({ locality: value })}
        onBlur={() => form.touch('locality')}
        placeholder="e.g. Koregaon Park"
        autoCapitalize="words"
        maxLength={80}
        errorText={form.errorFor('locality')}
      />
      <View style={styles.row}>
        <TextField
          label="City"
          value={city}
          onChangeText={(value) => form.set({ city: value })}
          onBlur={() => form.touch('city')}
          placeholder="e.g. Pune"
          autoCapitalize="words"
          textContentType="addressCity"
          maxLength={60}
          errorText={form.errorFor('city')}
          containerStyle={styles.half}
        />
        <TextField
          label="State"
          value={state}
          onChangeText={(value) => form.set({ state: value })}
          onBlur={() => form.touch('state')}
          placeholder="e.g. Maharashtra"
          autoCapitalize="words"
          textContentType="addressState"
          maxLength={60}
          errorText={form.errorFor('state')}
          containerStyle={styles.half}
        />
      </View>
      <TextField
        label="PIN code"
        value={postalCode}
        onChangeText={(value) => form.set({ postalCode: value.replace(/[^\d\s]/g, '') })}
        onBlur={() => form.touch('postalCode')}
        placeholder="6 digits"
        keyboardType="number-pad"
        autoComplete="postal-code"
        textContentType="postalCode"
        maxLength={7}
        returnKeyType="done"
        errorText={form.errorFor('postalCode')}
        containerStyle={styles.pincode}
      />
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  half: { flexGrow: 1, flexBasis: 150 },
  pincode: { maxWidth: 220 },
});
