import { OtpChallengeSchema, paths } from '@hungerly/api-client';
import {
  Badge,
  Button,
  Card,
  Chip,
  colors,
  Divider,
  Icon,
  radius,
  Screen,
  screenGutter,
  spacing,
  Text,
  TextField,
} from '@hungerly/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';

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

type AuthMode = 'login' | 'register';

/** R1: restaurant owners sign in or register with a one-time code sent to their phone or email. */
export default function LoginScreen() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [channel, setChannel] = useState<LoginChannel>('phone');
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Register mode always uses phone channel
  const activeChannel: LoginChannel = authMode === 'register' ? 'phone' : channel;
  const identifier = parseLoginInput(activeChannel, value);
  const fieldError =
    error ??
    (touched && value.trim().length > 0 && !identifier ? loginInputError(activeChannel) : undefined);

  const switchMode = (next: AuthMode) => {
    if (next === authMode) return;
    setAuthMode(next);
    setValue('');
    setTouched(false);
    setError(null);
  };

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
          mode: authMode,
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
          {/* Brand */}
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
          </View>

          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <Pressable
              style={[styles.modeTab, authMode === 'login' && styles.modeTabActive]}
              onPress={() => switchMode('login')}
              accessibilityRole="tab"
              accessibilityState={{ selected: authMode === 'login' }}
            >
              <Icon
                name="log-in-outline"
                color={authMode === 'login' ? 'primary' : 'textSecondary'}
                size="sm"
              />
              <Text
                variant="label"
                color={authMode === 'login' ? 'primaryText' : 'textSecondary'}
              >
                Sign in
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeTab, authMode === 'register' && styles.modeTabActive]}
              onPress={() => switchMode('register')}
              accessibilityRole="tab"
              accessibilityState={{ selected: authMode === 'register' }}
            >
              <Icon
                name="storefront-outline"
                color={authMode === 'register' ? 'primary' : 'textSecondary'}
                size="sm"
              />
              <Text
                variant="label"
                color={authMode === 'register' ? 'primaryText' : 'textSecondary'}
              >
                Register
              </Text>
            </Pressable>
          </View>

          {authMode === 'login' ? (
            <>
              <View style={styles.sectionHeader}>
                <Text variant="h1" accessibilityRole="header">
                  Sign in to your restaurant
                </Text>
                <Text variant="body" color="textSecondary">
                  Enter your phone number or email — we'll send a 6-digit code to verify you.
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
                  key="login-phone"
                  label="Mobile number"
                  value={value}
                  onChangeText={(text) => { setValue(text); setError(null); }}
                  onBlur={() => setTouched(true)}
                  onSubmitEditing={submit}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  returnKeyType="done"
                  maxLength={14}
                  placeholder="98765 43210"
                  errorText={fieldError}
                  leading={<Text variant="bodyLarge" color="textSecondary">+91</Text>}
                />
              ) : (
                <TextField
                  key="login-email"
                  label="Email address"
                  value={value}
                  onChangeText={(text) => { setValue(text); setError(null); }}
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
            </>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text variant="h1" accessibilityRole="header">
                  Register your restaurant
                </Text>
                <Text variant="body" color="textSecondary">
                  Enter your mobile number to get started. We'll send a 6-digit OTP to verify your identity.
                </Text>
              </View>

              <Card style={styles.registerInfoCard}>
                <Text variant="label" color="textSecondary">WHAT YOU'LL NEED</Text>
                {[
                  'Restaurant details and photos',
                  'FSSAI food licence',
                  'PAN and business information',
                  'Bank account for payouts',
                ].map((item) => (
                  <View key={item} style={styles.registerInfoRow}>
                    <Icon name="checkmark-circle-outline" color="primary" size="sm" />
                    <Text variant="bodySmall" color="textSecondary">{item}</Text>
                  </View>
                ))}
              </Card>

              <TextField
                key="register-phone"
                label="Your mobile number"
                value={value}
                onChangeText={(text) => { setValue(text); setError(null); }}
                onBlur={() => setTouched(true)}
                onSubmitEditing={submit}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                returnKeyType="done"
                maxLength={14}
                placeholder="98765 43210"
                errorText={fieldError}
                helperText="We'll send an OTP to verify your number"
                leading={<Text variant="bodyLarge" color="textSecondary">+91</Text>}
              />
            </>
          )}

          <View style={styles.spacer} />

          <Button
            label={authMode === 'register' ? 'Send OTP to register' : 'Send code'}
            onPress={submit}
            loading={submitting}
            disabled={!identifier}
            fullWidth
          />
          <Text variant="caption" color="textTertiary" align="center">
            By continuing you agree to Swaadone's Partner Terms and Privacy Policy.
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
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.lg,
  },
  header: { gap: spacing.sm },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  brandText: { gap: spacing.xs, alignItems: 'flex-start' },
  partnerBadge: { alignSelf: 'flex-start' },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  modeTabActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: { gap: spacing.xs },
  channels: { flexDirection: 'row', gap: spacing.sm },
  registerInfoCard: { padding: spacing.md, gap: spacing.sm },
  registerInfoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  spacer: { flex: 1, minHeight: spacing['2xl'] },
});
