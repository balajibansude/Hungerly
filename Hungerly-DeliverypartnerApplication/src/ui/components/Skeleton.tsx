import { useEffect } from 'react';
import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '../theme/colors';
import { radius as radii } from '../theme/layout';

export interface SkeletonProps {
  width?: DimensionValue;
  height: number;
  radius?: keyof typeof radii;
  style?: StyleProp<ViewStyle>;
}

/**
 * Placeholder block with a gentle pulse. Skeletons mirror the real layout so content
 * does not jump when it arrives. Pulsing stops when the OS "reduce motion" setting is on.
 */
export function Skeleton({ width = '100%', height, radius = 'md', style }: SkeletonProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.set(
      withRepeat(
        withTiming(0.45, {
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radii[radius], backgroundColor: colors.imagePlaceholder },
        animatedStyle,
        style,
      ]}
    />
  );
}
