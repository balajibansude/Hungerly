import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { screenGutter, spacing } from '../theme/layout';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  /** Right-aligned actions (usually IconButtons). */
  actions?: ReactNode;
}

/** In-screen header used instead of native headers so all apps share one look. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Go back',
  actions,
}: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      {onBack && <IconButton icon="chevron-back" accessibilityLabel={backLabel} onPress={onBack} />}
      <View style={styles.titles}>
        {title && (
          <Text variant="h3" numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        )}
        {subtitle && (
          <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {actions && <View style={styles.actions}>{actions}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: screenGutter,
    paddingVertical: spacing.sm,
  },
  titles: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
