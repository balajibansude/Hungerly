import { forwardRef } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors } from '../theme/colors';
import { minTouchTarget, radius, spacing } from '../theme/layout';
import { maxFontSizeMultiplier, typography } from '../theme/typography';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Text } from './Text';

interface BaseProps {
  placeholder: string;
  style?: StyleProp<ViewStyle>;
}

export interface SearchBarButtonProps extends BaseProps {
  /** Renders a tappable bar that opens the search screen (used on Home). */
  onPress: () => void;
}

export interface SearchBarInputProps extends BaseProps {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

/** Tappable search entry point. Looks identical to the input so the transition feels continuous. */
export function SearchBarButton({ placeholder, onPress, style }: SearchBarButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      accessibilityHint="Opens search"
      style={({ pressed }) => [styles.bar, pressed && styles.pressed, style]}
    >
      <Icon name="search" color="textSecondary" />
      <Text variant="body" color="textTertiary" numberOfLines={1} style={styles.flex}>
        {placeholder}
      </Text>
    </Pressable>
  );
}

export const SearchBarInput = forwardRef<TextInput, SearchBarInputProps>(function SearchBarInput(
  { placeholder, value, onChangeText, onSubmit, autoFocus, style },
  ref,
) {
  return (
    <View style={[styles.bar, style]}>
      <Icon name="search" color="textSecondary" />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.primary}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={[styles.input, styles.flex]}
      />
      {value.length > 0 && (
        <IconButton
          icon="close-circle"
          variant="ghost"
          iconColor="textTertiary"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    minHeight: minTouchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  flex: { flex: 1 },
  input: { ...typography.body, color: colors.textPrimary, paddingVertical: spacing.sm },
});
