import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, fontFamily, Icon, radius } from '@/ui';

const KNOB = 56;
const PAD = 4;

/**
 * Swipe-to-confirm. Used for irreversible delivery steps so a pocket tap can never accept an order or
 * mark one delivered by accident.
 */
export function SlideToConfirm({
  label,
  onConfirm,
  loading,
  disabled,
  tone = 'primary',
}: {
  label: string;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'success';
}) {
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const max = Math.max(0, width - KNOB - PAD * 2);
  const bg = { primary: colors.primary, secondary: colors.secondary, success: colors.success }[tone];

  const fire = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
  };

  // The whole bar is the drag area. A sideways drag wins over the parent ScrollView's vertical scroll
  // (activeOffsetX) and only a clearly vertical move lets the sheet scroll instead (failOffsetY).
  const pan = Gesture.Pan()
    .enabled(!disabled && !loading && max > 0)
    .activeOffsetX([-6, 6])
    .failOffsetY([-28, 28])
    .shouldCancelWhenOutside(false)
    .onUpdate((e) => {
      x.value = Math.min(max, Math.max(0, e.translationX));
    })
    .onEnd(() => {
      if (x.value > max * 0.75) {
        x.value = withSequence(withTiming(max, { duration: 100 }), withDelay(350, withTiming(0, { duration: 350 })));
        scheduleOnRN(fire);
      } else {
        x.value = withSpring(0, { damping: 16, stiffness: 220 });
      }
    });

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const text = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, max * 0.6 || 1], [1, 0]) }));
  const fill = useAnimatedStyle(() => ({ width: x.value + KNOB + PAD }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.track, { backgroundColor: disabled ? colors.disabled : bg }]}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint="Swipe right to confirm"
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => !disabled && !loading && fire()}
        collapsable={false}
      >
        <Animated.View style={[styles.fill, fill]} pointerEvents="none" />
        <Animated.Text style={[styles.label, text, disabled && { color: colors.onDisabled }]} pointerEvents="none">
          {label}
        </Animated.Text>
        <Animated.View style={[styles.knob, knob]} pointerEvents="none">
          {loading ? <ActivityIndicator color={bg} /> : <Icon name="chevron-forward" size="lg" color={disabled ? 'onDisabled' : tone === 'success' ? 'success' : tone} />}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: { height: KNOB + PAD * 2, borderRadius: radius.pill, justifyContent: 'center', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.pill },
  label: {
    position: 'absolute',
    left: KNOB + 16,
    right: 16,
    textAlign: 'center',
    color: colors.onPrimary,
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: 0.2,
  },
  knob: {
    position: 'absolute',
    left: PAD,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
