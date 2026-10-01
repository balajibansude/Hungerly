import { spacing, Text } from '@hungerly/ui';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export interface ChoiceGroupProps {
  label: string;
  helperText?: string;
  errorText?: string;
  children: ReactNode;
}

/** A labelled set of chips with its helper or error text directly underneath. */
export function ChoiceGroup({ label, helperText, errorText, children }: ChoiceGroupProps) {
  return (
    <View style={styles.group} accessibilityLabel={label}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <View style={styles.chips}>{children}</View>
      {errorText ? (
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
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
