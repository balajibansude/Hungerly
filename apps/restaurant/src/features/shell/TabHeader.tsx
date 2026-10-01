import { screenGutter, spacing, Text } from '@hungerly/ui';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { activeMembership, useSessionStore } from '@/features/auth/session';

export interface TabHeaderProps {
  title: string;
  /** Right-aligned controls (the online switch and notifications bell arrive later). */
  actions?: ReactNode;
}

/** Title row for every tab, with the restaurant name so staff always know where they are. */
export function TabHeader({ title, actions }: TabHeaderProps) {
  const restaurantName = useSessionStore((s) => activeMembership(s.session)?.restaurantName);
  return (
    <View style={styles.header}>
      <View style={styles.titles}>
        {restaurantName && (
          <Text variant="label" color="textSecondary" numberOfLines={1}>
            {restaurantName}
          </Text>
        )}
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
