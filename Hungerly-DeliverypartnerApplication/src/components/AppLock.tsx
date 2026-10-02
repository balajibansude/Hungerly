import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button, colors, spacing, Text } from '@/ui';

import { getAppLock } from '../lib/secure';
import { LogoMark } from './Logo';
import { useSession } from '../lib/session';

const RELOCK_AFTER_MS = 60_000;

/**
 * Optional biometric / device-PIN lock. When enabled, the app re-locks after being in the background for
 * a minute, so a lost or borrowed phone does not expose customer addresses and phone numbers.
 */
export function AppLock() {
  const phase = useSession((s) => s.phase);
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Hungerly Partner',
      fallbackLabel: 'Use passcode',
      disableDeviceFallback: false,
    });
    if (res.success) setLocked(false);
  }, []);

  useEffect(() => {
    if (phase !== 'signedIn') return;
    void getAppLock().then((on) => {
      if (on) {
        setLocked(true);
        void unlock();
      }
    });
  }, [phase, unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active' && backgroundedAt.current && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) {
        backgroundedAt.current = null;
        if (useSession.getState().phase === 'signedIn' && (await getAppLock())) {
          setLocked(true);
          void unlock();
        }
      }
    });
    return () => sub.remove();
  }, [unlock]);

  if (!locked || phase !== 'signedIn') return null;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={[StyleSheet.absoluteFill, styles.root]}>
      <View style={styles.mark}>
        <LogoMark size={72} />
      </View>
      <Text variant="h2" color="textInverse">Locked</Text>
      <Button label="Unlock" icon="finger-print" onPress={() => void unlock()} style={{ marginTop: spacing.xl, minWidth: 200 }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, zIndex: 90 },
  mark: { marginBottom: spacing.lg },
});
