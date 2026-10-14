import { OtpChallengeSchema, paths } from '@hungerly/api-client';
import { Badge, Button, Chip, Screen, screenGutter, spacing, Text, TextField } from '@hungerly/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import {
  destinationOf,
  loginInputError,
  parseLoginInput,
  type LoginChannel,
} from '@/features/auth/loginForm';
import { BrandLogo } from '@/features/brand/BrandLogo';
import { brand } from '@/features/brand/brand';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

/** R1: restaurant owners sign in with a one-time code sent to their phone or email. */
export default function LoginScreen() {
  const [channel, setChannel] = useState<LoginChannel>('phone');
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identifier = parseLoginInput(channel, value);
  const fieldError =
    error ??
    (touched && value.trim().length > 0 && !identifier ? loginInputError(channel) : undefined);

  const switchChannel = (next: LoginChannel) => {
    if (next === channel) return;
    setChannel(next);
    setValue('');
    setTouched(false);
    setError(null);
  };

  const submit = async () => {
    setTouched(true);
    if (!identifier) return;
    setSubmitting(true);
    setError(null);
    try {
      const challenge = await api.request('POST', paths.auth.otpRequest, {
        body: identifier,
        schema: OtpChallengeSchema,
        anonymous: true,
      });
      router.push({
        pathname: '/verify',
        params: {
          channel: identifier.channel,
          destination: destinationOf(identifier),
          requestId: challenge.requestId,
          resendAfter: String(challenge.resendAfterSeconds),
          devDelivery: challenge.devDelivery ?? '',
        },
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <BrandLogo height={56} />
              <View style={styles.brandText}>
                <Text variant="h2" color="primaryText">
                  {brand.name}
                </Text>
                <Badge label="Partner" tone="offer" style={styles.partnerBadge} />
              </View>
            </View>
            <Text variant="h1" accessibilityRole="header">
              Log in to your restaurant
            </Text>
            <Text variant="body" color="textSecondary">
              Restaurant owners sign in with a 6-digit code. New here? Use your phone number or
              email and we’ll help you register your restaurant.
            </Text>
          </View>

          <View style={styles.channels}>
            <Chip
              label="Phone"
              icon="call-outline"
              selected={channel === 'phone'}
              onPress={() => switchChannel('phone')}
            />
            <Chip
              label="Email"
              icon="mail-outline"
              selected={channel === 'email'}
              onPress={() => switchChannel('email')}
            />
          </View>

          {channel === 'phone' ? (
            <TextField
              key="phone"
              label="Mobile number"
              value={value}
              onChangeText={(text) => {
                setValue(text);
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
          ) : (
            <TextField
              key="email"
              label="Email address"
              value={value}
              onChangeText={(text) => {
                setValue(text);
                setError(null);
              }}
              onBlur={() => setTouched(true)}
              onSubmitEditing={submit}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              maxLength={254}
              placeholder="name@restaurant.com"
              errorText={fieldError}
            />
          )}


          <View style={styles.spacer} />

          <Button
            label="Send code"
            onPress={submit}
            loading={submitting}
            disabled={!identifier}
            fullWidth
          />
          <Text variant="caption" color="textTertiary" align="center">
            By continuing you agree to Swaadone’s Partner Terms and Privacy Policy.
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
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  brandText: { gap: spacing.xs, alignItems: 'flex-start' },
  partnerBadge: { alignSelf: 'flex-start' },
  channels: { flexDirection: 'row', gap: spacing.sm },
  spacer: { flex: 1, minHeight: spacing['2xl'] },
});
