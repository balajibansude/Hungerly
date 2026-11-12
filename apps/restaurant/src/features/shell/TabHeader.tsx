import { screenGutter, spacing, Text } from '@hungerly/ui';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BranchSwitcher } from '@/features/branch/BranchSwitcher';

export interface TabHeaderProps {
  title: string;
  /** Right-aligned controls. */
  actions?: ReactNode;
}

/** Title row for every tab, with the branch switcher so owners always know which branch they see. */
export function TabHeader({ title, actions }: TabHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titles}>
        <BranchSwitcher />
        <Text variant="h1" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: screenGutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  titles: { flex: 1, gap: spacing.xxs },
});
