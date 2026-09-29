import { forwardRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
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

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
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
  const hasError = Boolean(errorText);
  const borderColor = hasError ? colors.error : focused ? colors.focus : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {!hideLabel && (
        <Text variant="label" color="textSecondary">
          {label}
        </Text>
      )}
      <View
        style={[
          styles.field,
          { borderColor },
          focused && styles.focused,
          !editable && styles.disabled,
        ]}
      >
        {leading}
        <TextInput
          ref={ref}
          {...inputProps}
          editable={editable}
          accessibilityLabel={label}
          accessibilityHint={errorText ?? helperText}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          placeholderTextColor={colors.textTertiary}
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
      </View>
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
    backgroundColor: colors.surface,
  },
  focused: { backgroundColor: colors.surface },
  disabled: { backgroundColor: colors.surfaceMuted },
  input: {
    flex: 1,
    ...typography.bodyLarge,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  },
});
