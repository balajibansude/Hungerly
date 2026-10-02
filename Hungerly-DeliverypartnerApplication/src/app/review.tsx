import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { errorMessage } from '@/lib/api';
import { SUPPORT_PHONE } from '@/lib/config';
import { vehicleLabel } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, colors, Icon, type IconName, radius, Screen, screenGutter, spacing, Text } from '@/ui';

export default function Review() {
  const partner = useSession((s) => s.partner);
  const reload = useSession((s) => s.reloadPartner);
  const signOut = useSession((s) => s.signOut);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pulse = useSharedValue(0);
  const suspended = partner?.status === 'suspended' || partner?.status === 'offboarded';

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
  }, [pulse]);

  // Check again whenever the rider comes back to the app (approval happens in the admin panel).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void reload().catch(() => undefined));
    const t = setInterval(() => void reload().catch(() => undefined), 30_000);
    return () => {
      sub.remove();
      clearInterval(t);
    };
  }, [reload]);

  const ring = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.12 }], opacity: 0.6 - pulse.value * 0.4 }));

  const check = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const p = await reload();
      if (p?.status === 'pending_review') setMsg('Still under review. We usually finish within 24 hours.');
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Animated.View style={[styles.ring, ring, { backgroundColor: suspended ? colors.errorSoft : colors.accentSoft }]} />
          <View style={[styles.badge, { backgroundColor: suspended ? colors.error : colors.accent }]}>
            <Icon name={suspended ? 'pause' : 'hourglass-outline'} size="xl" color="onPrimary" />
          </View>
        </View>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.copy}>
          <Text variant="h1" align="center" accessibilityRole="header">
            {suspended ? 'Account on hold' : 'Under review'}
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            {suspended ? partner?.status_reason ?? 'Contact support to know more.' : "You can go online as soon as you're approved."}
          </Text>
        </Animated.View>

        {!suspended && (
          <View style={styles.steps}>
            <Step icon="checkmark" done title="Submitted" sub={`${vehicleLabel(partner?.vehicle_type)}${partner?.vehicle_registration ? ` · ${partner.vehicle_registration}` : ''}`} />
            <Step icon="shield-checkmark-outline" title="Verification" sub="Usually within 24 hours" active />
            <Step icon="bicycle-outline" title="Start delivering" sub="Go online" />
          </View>
        )}

        {msg && <Text variant="bodySmall" color="textSecondary" align="center">{msg}</Text>}
        <View style={styles.spacer} />
        {suspended ? (
          <Button label="Call support" icon="call-outline" onPress={() => void Linking.openURL(`tel:${SUPPORT_PHONE}`)} fullWidth />
        ) : (
          <Button label="Check status" icon="refresh" onPress={check} loading={busy} fullWidth />
        )}
        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} fullWidth />
      </ScrollView>
    </Screen>
  );
}

function Step({ icon, title, sub, done, active }: { icon: IconName; title: string; sub: string; done?: boolean; active?: boolean }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepIcon, done && { backgroundColor: colors.success }, active && { backgroundColor: colors.accentSoft }]}>
        <Icon name={icon} size="md" color={done ? 'onPrimary' : active ? 'onAccentSoft' : 'textTertiary'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="h3" color={done || active ? 'textPrimary' : 'textTertiary'}>{title}</Text>
        <Text variant="bodySmall" color="textTertiary">{sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: screenGutter, paddingTop: spacing['4xl'], paddingBottom: spacing.lg, gap: spacing.xl },
  hero: { alignItems: 'center', justifyContent: 'center', height: 140 },
  ring: { position: 'absolute', width: 132, height: 132, borderRadius: 66 },
  badge: { width: 88, height: 88, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: spacing.sm },
  steps: { gap: spacing.lg, padding: spacing.xl, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1, minHeight: spacing.lg },
});
