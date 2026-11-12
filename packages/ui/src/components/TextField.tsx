import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { maxFontSizeMultiplier, typography } from '../theme/typography';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label: string;
  /** Visually hides the label while keeping it for screen readers. */
  hideLabel?: boolean;
  helperText?: string;
  errorText?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  {
    label,
    hideLabel = false,
    helperText,
    errorText,
    leading,
    trailing,
    containerStyle,
    editable = true,
    onFocus,
    onBlur,
    ...inputProps
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInputInstance>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInputInstance, []);
  const hasError = Boolean(errorText);
  const borderColor = hasError ? colors.error : focused ? colors.focus : colors.surfaceMuted;
  // The label and the whole field box focus the input: a larger, more forgiving target.
  const focusInput = () => inputRef.current?.focus();

  return (
    <View style={[styles.container, containerStyle]}>
      {!hideLabel && (
        <Pressable onPress={focusInput} accessible={false}>
          <Text variant="label" color="textSecondary">
            {label}
          </Text>
        </Pressable>
      )}
      <Pressable
        onPress={focusInput}
        accessible={false}
        disabled={!editable}
        style={[
          styles.field,
          { borderColor },
          focused && styles.focused,
          !editable && styles.disabled,
        ]}
      >
        {leading}
        <TextInput
          ref={inputRef}
          {...inputProps}
          editable={editable}
          accessibilityLabel={label}
          accessibilityHint={errorText ?? helperText}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={styles.input}
        />
        {trailing}
      </Pressable>
      {hasError ? (
        <Text variant="bodySmall" color="error" accessibilityLiveRegion="polite">
          {errorText}
        </Text>
      ) : helperText ? (
        <Text variant="bodySmall" color="textTertiary">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: spacing.xs + spacing.xxs },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.input,
    borderWidth: 1.5,
    backgroundColor: colors.surfaceMuted,
  },
  focused: { backgroundColor: colors.primarySoft },
  disabled: { backgroundColor: colors.surfaceMuted },
  input: {
    flex: 1,
    ...typography.bodyLarge,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  },
});
