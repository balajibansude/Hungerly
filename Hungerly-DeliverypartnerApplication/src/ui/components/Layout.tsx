import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, type ColorToken } from '../theme/colors';
import { hitSlop, screenGutter, spacing } from '../theme/layout';
import { Text } from './Text';

export interface ScreenProps {
  children: ReactNode;
  /** Safe-area edges to pad. Screens under a tab bar or header omit 'bottom'/'top'. */
  edges?: Edge[];
  background?: ColorToken;
  style?: StyleProp<ViewStyle>;
}

/** Root container for every screen: safe areas + the design-system background. */
export function Screen({
  children,
  edges = ['top'],
  background = 'background',
  style,
}: ScreenProps) {
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.screen, { backgroundColor: colors[background] }, style]}
    >
      {children}
    </SafeAreaView>
  );
}

export function Divider({ inset = false }: { inset?: boolean }) {
  return <View style={[styles.divider, inset && styles.inset]} />;
}

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flex}>
        <Text variant="h2" accessibilityRole="header">
          {title}
        </Text>
        {subtitle && (
          <Text variant="bodySmall" color="textSecondary">
            {subtitle}
          </Text>
        )}
      </View>
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}: ${title}`}
        >
          <Text variant="label" color="textLink">
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  inset: { marginHorizontal: screenGutter },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: screenGutter,
    marginBottom: spacing.md,
  },
});
