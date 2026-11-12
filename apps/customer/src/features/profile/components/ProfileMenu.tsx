import { Badge, colors, Icon, radius, spacing, Switch, Text, type IconName } from '@hungerly/ui';
import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

const ICON_TILE = 44;

/** Uppercase section title above a rounded card of rows separated by inset dividers. */
export function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      <Text variant="label" color="textTertiary" accessibilityRole="header" style={styles.title}>
        {title.toUpperCase()}
      </Text>
      <View style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 && <View style={styles.divider} />}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

export type MenuRowTone = 'default' | 'danger';

export interface MenuRowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  tone?: MenuRowTone;
  /** Marks a destination that is not built yet: a "Soon" badge replaces the chevron. */
  comingSoon?: boolean;
  testID?: string;
}

/** Icon tile · title and supporting text · chevron. The whole row is one button. */
export function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
  tone = 'default',
  comingSoon = false,
  testID,
}: MenuRowProps) {
  const danger = tone === 'danger';
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, comingSoon ? 'coming soon' : undefined]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.iconTile, danger && styles.iconTileDanger]}>
        <Icon name={icon} color={danger ? 'error' : 'textSecondary'} />
      </View>
      <View style={styles.copy}>
        <Text variant="bodyLarge" color={danger ? 'error' : 'textPrimary'}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="bodySmall" color="textSecondary">
            {subtitle}
          </Text>
        )}
      </View>
      {comingSoon ? (
        <Badge label="Soon" tone="neutral" style={styles.soon} />
      ) : (
        <Icon name="chevron-forward" color="textTertiary" />
      )}
    </Pressable>
  );
}

/** A row with a switch. `disabled` keeps the control visible but inert. */
export function SwitchMenuRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  disabled = false,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.iconTile}>
        <Icon name={icon} color={disabled ? 'onDisabled' : 'textSecondary'} />
      </View>
      <View style={styles.copy}>
        <Text variant="bodyLarge" color={disabled ? 'textTertiary' : 'textPrimary'}>
          {title}
        </Text>
        <Text variant="bodySmall" color="textSecondary">
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={`${title}. ${subtitle}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  title: { paddingHorizontal: spacing.xs },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg + ICON_TILE + spacing.md,
    backgroundColor: colors.border,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  iconTile: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  iconTileDanger: { backgroundColor: colors.errorSoft },
  soon: { alignSelf: 'center' },
  copy: { flex: 1, gap: spacing.xxs },
});
