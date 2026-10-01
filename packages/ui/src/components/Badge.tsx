import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, type ColorToken } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type BadgeTone = 'offer' | 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'dark';

const tones: Record<BadgeTone, { background: ColorToken; text: ColorToken }> = {
  offer: { background: 'primarySoft', text: 'primary' },
  neutral: { background: 'surfaceMuted', text: 'textSecondary' },
  info: { background: 'infoSoft', text: 'info' },
  success: { background: 'successSoft', text: 'success' },
  warning: { background: 'warningSoft', text: 'warning' },
  error: { background: 'errorSoft', text: 'error' },
  dark: { background: 'secondary', text: 'onSecondary' },
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

/** Small non-interactive status or promotion label. */
export function Badge({ label, tone = 'neutral', icon, style }: BadgeProps) {
  const { background, text } = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors[background] }, style]}>
      {icon && <Icon name={icon} size="sm" color={text} />}
      <Text variant="caption" color={text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radius.sm,
  },
});
