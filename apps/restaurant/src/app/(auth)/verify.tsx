import {
  Badge,
  Button,
  ErrorState,
  OtpInput,
  Screen,
  ScreenHeader,
  screenGutter,
  spacing,
  Text,
} from '@hungerly/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextInput,
} from 'react-native';

import { describeDestination, identifierFromParams } from '@/features/auth/loginForm';
import { useSessionStore } from '@/features/auth/session';
import { PROTOTYPE_OTP, useServices, userMessage } from '@/services';

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const params = useLocalSearchParams<{
    channel: string;
    destination: string;
    requestId: string;
    resendAfter?: string;
  }>();
  const identifier = identifierFromParams(params.channel, params.destination);
  const { auth } = useServices();
  const signIn = useSessionStore((s) => s.signIn);
  const inputRef = useRef<TextInput>(null);

  const [requestId, setRequestId] = useState(params.requestId);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Number(params.resendAfter ?? 30));

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const changeLabel = identifier?.channel === 'email' ? 'Change email' : 'Change mobile number';

  if (!identifier || !requestId) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader onBack={() => router.back()} backLabel="Back to login" />
        <ErrorState
          title="Let’s start again"
          message="We couldn’t find where to send your code."
          actionLabel="Back to login"
          onRetry={() => router.back()}
        />
      </Screen>
    );
  }

  const verify = async (value = code) => {
    if (value.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const session = await auth.verifyOtp(requestId, value);
      signIn(session);
      // The gate decides between onboarding and the restaurant workspace.
      router.replace('/');
    } catch (e) {
      setError(userMessage(e));
      setCode('');
      inputRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setError(null);
    setCode('');
    try {
      const challenge = await auth.requestOtp(identifier);
      setRequestId(challenge.requestId);
      setSecondsLeft(challenge.resendAfterSeconds);
    } catch (e) {
      setError(userMessage(e));
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader onBack={() => router.back()} backLabel={changeLabel} />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="h1" accessibilityRole="header">
              Enter the code
            </Text>
            <Text variant="body" color="textSecondary">
              Sent {describeDestination(identifier)}.
            </Text>
          </View>

          <Badge
            tone="warning"
            icon="flask-outline"
            label={`Prototype: no ${identifier.channel === 'email' ? 'email' : 'SMS'} is sent. Use ${PROTOTYPE_OTP}`}
          />

          <OtpInput
            ref={inputRef}
            value={code}
            onChange={(value) => {
              setCode(value);
              setError(null);
            }}
            onComplete={verify}
            length={CODE_LENGTH}
            hasError={Boolean(error)}
          />
          {error && (
            <Text variant="bodySmall" color="error" accessibilityLiveRegion="assertive">
              {error}
            </Text>
          )}

          <View style={styles.resendRow}>
            {secondsLeft > 0 ? (
              <Text variant="bodySmall" color="textTertiary">
                Resend code in 0:{String(secondsLeft).padStart(2, '0')}
              </Text>
            ) : (
              <Pressable onPress={resend} hitSlop={12} accessibilityRole="button">
                <Text variant="label" color="textLink">
                  Resend code
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.spacer} />
          <Button
            label="Verify and continue"
            onPress={() => verify()}
            loading={verifying}
            disabled={code.length !== CODE_LENGTH}
            fullWidth
          />
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  header: { gap: spacing.sm },
  resendRow: { minHeight: 24, justifyContent: 'center' },
  spacer: { flex: 1, minHeight: spacing['2xl'] },
});
