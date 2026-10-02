import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { colors, Icon, type IconName, PressableScale, radius, spacing } from '@/ui';

const shadow = Platform.select<ViewStyle>({
  ios: { shadowColor: colors.secondary, shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } },
  default: { elevation: 6 },
});

/** Round floating control used over the map. */
export function FloatButton({
  icon,
  onPress,
  label,
  tone = 'surface',
  style,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  tone?: 'surface' | 'dark';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.fab, shadow, tone === 'dark' && styles.fabDark, style]} hitSlop={6}>
      <Icon name={icon} size="md" color={tone === 'dark' ? 'onSecondary' : 'textPrimary'} />
    </PressableScale>
  );
}

/** Bottom card that sits over the map. */
export function Sheet({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.duration(320)} style={[styles.sheet, shadow, style]}>
      <View style={styles.grabber} />
      {children}
    </Animated.View>
  );
}

export const surfaceShadow = shadow;

const styles = StyleSheet.create({
  fab: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  fabDark: { backgroundColor: colors.secondary },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.modal,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
});
