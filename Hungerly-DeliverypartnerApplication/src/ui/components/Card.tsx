import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../theme/colors';
import { radius } from '../theme/layout';
import { PressableScale } from './PressableScale';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Bordered surface. Pressable when `onPress` is given; the whole card becomes one
 * accessible element with a single label, instead of many tiny focus stops.
 */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: CardProps) {
  if (!onPress) {
    return (
      <View testID={testID} style={[styles.card, style]}>
        {children}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[styles.card, style]}
    >
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
