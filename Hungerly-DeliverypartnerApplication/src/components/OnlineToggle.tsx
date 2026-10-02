import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fontFamily } from '@/ui';

import { surfaceShadow } from './Surface';

const W = 132;
const H = 46;
const KNOB = H - 8;

/** Duty switch pill for the map's top bar. */
export function OnlineToggle({ online, busy, onChange }: { online: boolean; busy: boolean; onChange: (v: boolean) => void }) {
  const v = useSharedValue(online ? 1 : 0);
  useEffect(() => {
    v.value = withSpring(online ? 1 : 0, { damping: 16, stiffness: 190 });
  }, [online, v]);

  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(v.value, [0, 1], [colors.secondary, colors.success]) }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: v.value * (W - KNOB - 8) }] }));
  const onText = useAnimatedStyle(() => ({ opacity: v.value }));
  const offText = useAnimatedStyle(() => ({ opacity: 1 - v.value }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: online, busy }}
      accessibilityLabel={online ? 'Online. Double tap to go offline.' : 'Offline. Double tap to go online.'}
      disabled={busy}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onChange(!online);
      }}
    >
      <Animated.View style={[styles.track, surfaceShadow, track]}>
        <Animated.Text style={[styles.label, styles.left, onText]}>Online</Animated.Text>
        <Animated.Text style={[styles.label, styles.right, offText]}>Offline</Animated.Text>
        <Animated.View style={[styles.knob, knob]}>
          {busy ? <ActivityIndicator size="small" color={colors.secondary} /> : <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.borderStrong }]} />}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: W, height: H, borderRadius: H / 2, padding: 4, justifyContent: 'center' },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { position: 'absolute', color: colors.onSecondary, fontFamily: fontFamily.bold, fontSize: 14 },
  left: { left: 18 },
  right: { right: 16 },
});
