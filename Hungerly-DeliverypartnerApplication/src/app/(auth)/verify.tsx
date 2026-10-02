import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { ApiError, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, fontFamily, radius, Screen, ScreenHeader, screenGutter, spacing, Text } from '@/ui';
import { formatE164India } from '@/ui/shared';

const LENGTH = 6;

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone: string; requestId: string; resendAfter?: string }>();
  const { verifyOtp, requestOtp } = useSession.getState();
  const [requestId, setRequestId] = useState(params.requestId);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(Number(params.resendAfter ?? 30));
  const input = useRef<TextInput>(null);
  const shake = useSharedValue(0);

  useEffect(() => {
    const t = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await verifyOtp({ phoneE164: params.phone, requestId, otp: value });
      // Routing is driven by the session guard in the root layout.
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
      shake.value = withSequence(withTiming(-8, { duration: 50 }), withTiming(8, { duration: 50 }), withTiming(-6, { duration: 50 }), withTiming(0, { duration: 50 }));
      if (e instanceof ApiError && (e.code === 'auth.otp_expired' || e.code === 'auth.otp_attempts_exceeded')) setWait(0);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      const res = await requestOtp(params.phone);
      setRequestId(res.otp_request_id);
      setWait(res.resend_after);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.content}>
        <Animated.View entering={FadeInDown.duration(400)} style={{ gap: spacing.sm }}>
          <Text variant="h1" accessibilityRole="header">Enter the code</Text>
          <Text variant="body" color="textSecondary">Sent by SMS to {formatE164India(params.phone)}</Text>
        </Animated.View>

        <Pressable onPress={() => input.current?.focus()} accessibilityLabel="One-time code">
          <Animated.View style={[styles.boxes, shakeStyle]}>
            {Array.from({ length: LENGTH }, (_, i) => {
              const filled = i < code.length;
              const focused = i === code.length && !busy;
              return (
                <View key={i} style={[styles.box, filled && styles.boxFilled, focused && styles.boxFocused, !!error && styles.boxError]}>
                  <Text variant="h2">{code[i] ?? ''}</Text>
                </View>
              );
            })}
          </Animated.View>
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, LENGTH);
            setCode(digits);
            setError(null);
            if (digits.length === LENGTH) void submit(digits);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          maxLength={LENGTH}
          editable={!busy}
          style={styles.hidden}
          importantForAutofill="yes"
        />
        {error ? <Text variant="bodySmall" color="error">{error}</Text> : busy ? <Text variant="bodySmall" color="textSecondary">Verifying…</Text> : null}

        <View style={styles.resendRow}>
          {wait > 0 ? (
            <Text variant="bodySmall" color="textTertiary">Resend code in 0:{String(wait).padStart(2, '0')}</Text>
          ) : (
            <Pressable onPress={resend} hitSlop={8} accessibilityRole="button">
              <Text variant="label" color="primary">Resend code</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: screenGutter, paddingTop: spacing.lg, gap: spacing.xl },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  box: {
    flex: 1,
    aspectRatio: 0.86,
    maxWidth: 56,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: { borderColor: colors.borderStrong },
  boxFocused: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  boxError: { borderColor: colors.error },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1, fontFamily: fontFamily.regular },
  resendRow: { flexDirection: 'row' },
});
