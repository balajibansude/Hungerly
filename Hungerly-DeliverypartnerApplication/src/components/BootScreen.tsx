import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, fontFamily } from '@/ui';

import { LogoMark } from './Logo';

const MIN_MS = 1200;

/**
 * Launch screen. Continues from the native splash (same green background): the logo springs in, the
 * wordmark rises, a thin progress line loops until the session is restored, then the screen lifts away.
 */
export function BootScreen({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const mark = useSharedValue(0);
  const word = useSharedValue(0);
  const line = useSharedValue(0);
  const exit = useSharedValue(0);
  const started = useRef(Date.now());

  useEffect(() => {
    mark.value = withSpring(1, { damping: 12, stiffness: 150 });
    word.value = withDelay(220, withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) }));
    line.value = withDelay(500, withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) }), -1, false));
  }, [mark, word, line]);

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_MS - (Date.now() - started.current));
    const t = setTimeout(() => {
      exit.value = withTiming(1, { duration: 380, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(onDone);
      });
    }, wait);
    return () => clearTimeout(t);
  }, [ready, exit, onDone]);

  const markStyle = useAnimatedStyle(() => ({ opacity: mark.value, transform: [{ scale: 0.6 + mark.value * 0.4 }] }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value, transform: [{ translateY: (1 - word.value) * 12 }] }));
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: line.value * 112 - 56 }], opacity: word.value }));
  const screen = useAnimatedStyle(() => ({ opacity: 1 - exit.value, transform: [{ scale: 1 + exit.value * 0.05 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, screen]} pointerEvents="none">
      <Animated.View style={markStyle}>
        <LogoMark size={88} />
      </Animated.View>
      <Animated.View style={[styles.words, wordStyle]}>
        <Animated.Text style={styles.word}>hungerly</Animated.Text>
        <Animated.Text style={styles.tag}>PARTNER</Animated.Text>
      </Animated.View>
      <View style={styles.track}>
        <Animated.View style={[styles.runner, lineStyle]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  words: { alignItems: 'center', marginTop: 20, gap: 6 },
  word: { color: colors.onSecondary, fontFamily: fontFamily.extrabold, fontSize: 32, letterSpacing: -1 },
  tag: { color: colors.accent, fontFamily: fontFamily.bold, fontSize: 11, letterSpacing: 3 },
  track: { position: 'absolute', bottom: 96, width: 112, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', alignItems: 'center' },
  runner: { width: 28, height: 3, borderRadius: 2, backgroundColor: colors.accent },
});
