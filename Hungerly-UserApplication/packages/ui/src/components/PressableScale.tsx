import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { motion } from '../theme/layout';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. Defaults to the design-system value. */
  pressedScale?: number;
}

/**
 * Pressable with a subtle spring scale. Used for cards and primary actions so touches
 * feel acknowledged immediately, without colour flashes on imagery.
 */
export function PressableScale({
  style,
  pressedScale = motion.pressedScale,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(event) => {
        scale.set(withSpring(pressedScale, motion.spring));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withSpring(1, motion.spring));
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    />
  );
}
