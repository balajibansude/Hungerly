import { colors, Icon, radius, spacing, Text, type IconName } from '@hungerly/ui';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/** Card with an icon-tile header, matching the restaurant-instructions section. */
export function CheckoutSection({
  icon,
  title,
  action,
  children,
}: {
  icon: IconName;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconTile}>
          <Icon name={icon} size="sm" color="primaryText" />
        </View>
        <Text variant="h3" accessibilityRole="header" style={styles.flex}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  flex: { flex: 1 },
});
