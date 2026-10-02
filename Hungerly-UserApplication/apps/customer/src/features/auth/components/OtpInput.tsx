import { colors, radius, spacing, Text, typography } from '@hungerly/ui';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  hasError?: boolean;
  onComplete?: (value: string) => void;
}

/**
 * One real (visually hidden) TextInput drives the boxes. This keeps SMS autofill
 * (`oneTimeCode` / `sms-otp`), paste and screen readers working, which separate
 * per-digit inputs break.
 */
export const OtpInput = forwardRef<TextInput, OtpInputProps>(function OtpInput(
  { value, onChange, length = 6, hasError = false, onComplete },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const digits = value.split('');

  return (
    <Pressable
      onPress={() => (ref && 'current' in ref ? ref.current?.focus() : undefined)}
      accessible={false}
      style={styles.row}
    >
      {Array.from({ length }, (_, index) => {
        const active = focused && index === Math.min(value.length, length - 1);
        return (
          <View
            key={index}
            style={[styles.box, active && styles.activeBox, hasError && styles.errorBox]}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <Text variant="h2">{digits[index] ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(text) => {
          const next = text.replace(/\D/g, '').slice(0, length);
          onChange(next);
          if (next.length === length) onComplete?.(next);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus
        caretHidden
        accessibilityLabel={`Verification code, ${length} digits`}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  box: {
    flex: 1,
    maxWidth: 56,
    aspectRatio: 0.86,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  activeBox: { borderColor: colors.focus },
  errorBox: { borderColor: colors.error },
  hiddenInput: {
    ...StyleSheet.absoluteFill,
    opacity: 0.02,
    color: 'transparent',
    fontSize: typography.body.fontSize,
  },
});
