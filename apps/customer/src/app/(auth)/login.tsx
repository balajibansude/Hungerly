import { Button, Screen, ScreenHeader, screenGutter, spacing, Text, TextField } from '@hungerly/ui';
import { isValidIndianMobile, toE164India } from '@hungerly/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { isLoginReason, loginCopyFor } from '@/features/auth/loginReasons';
import { brand } from '@/features/brand/brand';
import { BrandLogo } from '@/features/brand/BrandLogo';
import { useServices, userMessage } from '@/services';

/**
 * Log in or sign up with a mobile number. Opened from wherever a guest needs an account
 * (checkout, favourites, account); after verification the auth screens are removed and
 * the customer is back where they started.
 */
export default function LoginScreen() {
  const params = useLocalSearchParams<{ reason?: string }>();
  const copy = loginCopyFor(isLoginReason(params.reason) ? params.reason : undefined);
  const { auth } = useServices();
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = isValidIndianMobile(phone);
  const fieldError =
    error ??
    (touched && phone.length > 0 && !valid ? 'Enter a valid 10-digit mobile number' : undefined);

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const phoneE164 = toE164India(phone);
      const challenge = await auth.requestOtp(phoneE164);
      router.push({
        pathname: '/verify',
        params: {
          phone: phoneE164,
          requestId: challenge.requestId,
          resendAfter: String(challenge.resendAfterSeconds),
        },
      });
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      {router.canGoBack() && (
        <ScreenHeader onBack={() => router.back()} backLabel="Continue browsing" />
      )}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <BrandLogo height={96} />
            <Text variant="h1" accessibilityRole="header">
              {copy.title}
            </Text>
            <Text variant="body" color="textSecondary">
              {copy.message} We’ll text you a 6-digit code to confirm it’s you. New here? The same
              code creates your account.
            </Text>
          </View>

          <TextField
            label="Mobile number"
            value={phone}
            onChangeText={(value) => {
              setPhone(value);
              setError(null);
            }}
            onBlur={() => setTouched(true)}
            onSubmitEditing={submit}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            returnKeyType="done"
            maxLength={14}
            placeholder="98765 43210"
            errorText={fieldError}
            leading={
              <Text variant="bodyLarge" color="textSecondary">
                +91
              </Text>
            }
          />

          <View style={styles.spacer} />

          <Button
            label="Continue"
            onPress={submit}
            loading={submitting}
            disabled={!valid}
            fullWidth
          />
          <Text variant="caption" color="textTertiary" align="center">
            By continuing you agree to {brand.name}’s Terms of Service and Privacy Policy.
          </Text>
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
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  spacer: { flex: 1, minHeight: spacing['2xl'] },
});
