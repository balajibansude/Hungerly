import { Text, TextField } from '@hungerly/ui';

import { StepLayout } from '@/features/onboarding/components/StepLayout';
import { useStepForm } from '@/features/onboarding/useStepForm';

/**
 * Step 4 — Contact. Phone is required (`restaurants.phone_e164` NN); email is optional
 * (`restaurants.email` is nullable) but must be valid if given. Starts from the sign-in
 * phone/email; nothing is sent to verify these in the prototype.
 */
export default function ContactStep() {
  const form = useStepForm('contact');
  const { phone, email } = form.values;

  return (
    <StepLayout
      step="contact"
      subtitle="How customers and Hungerly support reach the restaurant."
      primary={form.primary}
      footerNote={form.footerNote}
    >
      <TextField
        label="Restaurant phone"
        value={phone}
        onChangeText={(value) => form.set({ phone: value })}
        onBlur={() => form.touch('phone')}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={14}
        placeholder="98765 43210"
        helperText="A mobile number staff answer during service."
        errorText={form.errorFor('phone')}
        leading={
          <Text variant="bodyLarge" color="textSecondary">
            +91
          </Text>
        }
      />
      <TextField
        label="Restaurant email (optional)"
        value={email}
        onChangeText={(value) => form.set({ email: value })}
        onBlur={() => form.touch('email')}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={254}
        returnKeyType="done"
        placeholder="hello@restaurant.com"
        helperText="For order reports and account updates."
        errorText={form.errorFor('email')}
      />
    </StepLayout>
  );
}
