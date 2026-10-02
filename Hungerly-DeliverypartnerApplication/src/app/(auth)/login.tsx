import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { LogoMark } from '@/components/Logo';
import { errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Screen, screenGutter, spacing, Text, TextField } from '@/ui';
import { isValidIndianMobile, toE164India } from '@/ui/shared';

export default function LoginScreen() {
  const requestOtp = useSession((s) => s.requestOtp);
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = isValidIndianMobile(phone);

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const phoneE164 = toE164India(phone);
      const res = await requestOtp(phoneE164);
      router.push({ pathname: '/verify', params: { phone: phoneE164, requestId: res.otp_request_id, resendAfter: String(res.resend_after) } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(450)} style={styles.hero}>
            <LogoMark size={64} />
            <View style={styles.titles}>
              <Text variant="display" accessibilityRole="header">Deliver with Hungerly</Text>
              <Text variant="body" color="textSecondary">Sign in with your mobile number.</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(450)}>
            <TextField
              label="Mobile number"
              value={phone}
              onChangeText={(v) => {
                setPhone(v.replace(/[^\d\s]/g, ''));
                setError(null);
              }}
              onBlur={() => setTouched(true)}
              onSubmitEditing={submit}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              maxLength={12}
              placeholder="98765 43210"
              errorText={error ?? (touched && phone.length > 0 && !valid ? 'Enter a valid 10-digit number' : undefined)}
              leading={<Text variant="bodyLarge" color="textSecondary">+91</Text>}
            />
          </Animated.View>

          <View style={styles.spacer} />
          <Button label="Get OTP" onPress={submit} loading={busy} disabled={!valid} fullWidth />
          <Text variant="caption" color="textTertiary" align="center">By continuing you agree to the Partner Terms.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, gap: spacing['2xl'], paddingHorizontal: screenGutter, paddingTop: spacing['5xl'], paddingBottom: spacing.lg },
  hero: { gap: spacing.xl },
  titles: { gap: spacing.xs },
  spacer: { flex: 1, minHeight: spacing.lg },
});
