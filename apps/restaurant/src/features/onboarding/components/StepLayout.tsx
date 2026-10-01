import {
  Button,
  colors,
  radius,
  Screen,
  ScreenHeader,
  screenGutter,
  spacing,
  Text,
  type IconName,
} from '@hungerly/ui';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { stepByKey, stepNumber, TOTAL_STEPS, type RegistrationStepKey } from '../steps';

/** Forms stay readable on tablets instead of stretching edge to edge. */
const MAX_CONTENT_WIDTH = 640;

export interface StepLayoutProps {
  step: RegistrationStepKey;
  subtitle?: string;
  children: ReactNode;
  primary: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    icon?: IconName;
  };
  /** Shown above the primary button, e.g. why it is disabled. */
  footerNote?: string;
}

/** Shared frame for registration steps: progress, scrolling form, pinned primary action. */
export function StepLayout({ step, subtitle, children, primary, footerNote }: StepLayoutProps) {
  const number = stepNumber(step);
  const { title } = stepByKey(step);
  const canGoBack = number > 1 && router.canGoBack();

  return (
    <Screen edges={['top', 'bottom']}>
      {canGoBack ? (
        <ScreenHeader onBack={() => router.back()} backLabel="Previous step" />
      ) : (
        <View style={styles.headerSpacer} />
      )}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.column}>
            <View style={styles.progress}>
              <Text variant="label" color="primary">
                Step {number} of {TOTAL_STEPS}
              </Text>
              <View
                style={styles.track}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={`Step ${number} of ${TOTAL_STEPS}`}
                accessibilityValue={{ min: 0, max: TOTAL_STEPS, now: number }}
              >
                {Array.from({ length: TOTAL_STEPS }, (_, index) => (
                  <View
                    key={index}
                    style={[styles.segment, index < number && styles.segmentDone]}
                  />
                ))}
              </View>
              <Text variant="h1" accessibilityRole="header">
                {title}
              </Text>
              {subtitle && (
                <Text variant="body" color="textSecondary">
                  {subtitle}
                </Text>
              )}
            </View>
            {children}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <View style={[styles.column, styles.footerColumn]}>
            {footerNote && (
              <Text variant="bodySmall" color="textSecondary" align="center">
                {footerNote}
              </Text>
            )}
            <Button
              label={primary.label}
              onPress={primary.onPress}
              disabled={primary.disabled}
              loading={primary.loading}
              icon={primary.icon}
              iconPosition="end"
              fullWidth
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerSpacer: { height: spacing.lg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: screenGutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
  },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: spacing.xl },
  progress: { gap: spacing.sm },
  track: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  segment: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.border },
  segmentDone: { backgroundColor: colors.primary },
  footer: {
    paddingHorizontal: screenGutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  footerColumn: { gap: spacing.sm },
});
