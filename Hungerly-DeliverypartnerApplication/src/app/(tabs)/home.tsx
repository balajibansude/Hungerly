import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfferSheet } from '@/components/OfferSheet';
import { OnlineToggle } from '@/components/OnlineToggle';
import { RiderMap, type RiderMapHandle } from '@/components/RiderMap';
import { FloatButton, Sheet, surfaceShadow } from '@/components/Surface';
import { api, errorMessage } from '@/lib/api';
import { initials, rupees } from '@/lib/format';
import {
  backgroundPermission,
  positionForAction,
  foregroundPermission,
  hasBackgroundPermission,
  isTracking,
  startTracking,
  stopTracking,
  useRiderPosition,
} from '@/lib/location';
import { keys, useCurrentAssignment, useMe, useOffers, useToday } from '@/lib/queries';
import { useSession } from '@/lib/session';
import type { Assignment } from '@/lib/types';
import { Button, colors, Icon, PressableScale, radius, spacing, Text } from '@/ui';

export const STEP_LABEL: Record<string, string> = {
  accepted: 'Go to restaurant',
  arrived_at_restaurant: 'Pick up order',
  picked_up: 'Go to customer',
  arrived_at_customer: 'Hand over order',
};

let askedBackground = false;

export default function Home() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const partner = useSession((s) => s.partner);
  const me = useMe();
  const current = useCurrentAssignment();
  const today = useToday();
  const rider = useRiderPosition();
  const map = useRef<RiderMapHandle>(null);
  const pathname = usePathname();
  const [pending, setPending] = useState<boolean | null>(null); // target state while toggling
  const [busyOffer, setBusyOffer] = useState<'accept' | 'reject' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const serverOnline = me.data?.is_online ?? partner?.is_online ?? false;
  const online = pending ?? serverOnline;
  const offers = useOffers(online && !current.data && pending === null);
  const offer = offers.data?.find((o) => !o.offer_expires_at || new Date(o.offer_expires_at).getTime() > Date.now());

  // Keep local tracking in step with the server's view of the rider.
  useEffect(() => {
    if (pending !== null || !me.data) return;
    if (me.data.is_online && !isTracking()) {
      void startTracking().catch(() => undefined);
    } else if (!me.data.is_online && isTracking()) {
      void stopTracking();
      setNotice("You've been set offline because your location stopped updating.");
    }
  }, [me.data, pending]);

  const toggle = useCallback(
    async (next: boolean) => {
      setPending(next);
      setNotice(null);
      try {
        if (next) {
          const perm = await foregroundPermission();
          if (perm !== 'granted') {
            Alert.alert(
              'Location needed',
              perm === 'services_off' ? 'Turn on location (GPS) to go online.' : 'Allow location so we can send you nearby orders.',
              [{ text: 'Not now', style: 'cancel' }, { text: 'Settings', onPress: () => void Linking.openSettings() }],
            );
            return;
          }
          if (Platform.OS !== 'web' && !askedBackground && !(await hasBackgroundPermission())) {
            askedBackground = true;
            await new Promise<void>((resolve) =>
              Alert.alert('Keep deliveries updating', 'Choose "Allow all the time" so your trip keeps updating while you use Maps.', [
                { text: 'Skip', style: 'cancel', onPress: () => resolve() },
                { text: 'Continue', onPress: () => void backgroundPermission().finally(resolve) },
              ]),
            );
          }
          const location = await positionForAction();
          await api('/delivery/availability', { method: 'PUT', body: { is_online: true, location } });
          await startTracking();
        } else {
          await api('/delivery/availability', { method: 'PUT', body: { is_online: false } });
          await stopTracking();
        }
        await qc.invalidateQueries({ queryKey: keys.me });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        Alert.alert(next ? "Couldn't go online" : "Couldn't go offline", errorMessage(e));
      } finally {
        setPending(null);
      }
    },
    [qc],
  );

  const accept = async (o: Assignment) => {
    setBusyOffer('accept');
    try {
      const a = await api<Assignment>(`/delivery/offers/${o.id}/accept`, { method: 'POST' });
      qc.setQueryData(keys.current, a);
      qc.setQueryData(keys.offers, []);
      router.push('/delivery');
    } catch (e) {
      Alert.alert('Offer unavailable', errorMessage(e));
      void qc.invalidateQueries({ queryKey: keys.offers });
    } finally {
      setBusyOffer(null);
    }
  };

  const reject = async (o: Assignment) => {
    setBusyOffer('reject');
    try {
      await api(`/delivery/offers/${o.id}/reject`, { method: 'POST', body: { reason: 'busy' } });
    } catch {
      /* the offer may already have expired */
    } finally {
      qc.setQueryData(keys.offers, []);
      setBusyOffer(null);
    }
  };

  const a = current.data;
  const t = today.data;
  const leg = a ? (a.status === 'accepted' || a.status === 'arrived_at_restaurant' ? 'pickup' : 'drop') : offer ? 'pickup' : null;

  return (
    <View style={styles.flex}>
      <RiderMap
        ref={map}
        rider={rider}
        pickup={a?.pickup.location ?? offer?.pickup.location ?? null}
        drop={a?.drop.location ?? null}
        leg={leg}
        insets={{ top: insets.top + 70, bottom: 250 }}
      />

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <PressableScale onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile" style={[styles.avatar, surfaceShadow]}>
          <Text variant="label" color="secondary">{initials(partner?.full_name)}</Text>
        </PressableScale>
        <OnlineToggle online={online} busy={pending !== null} onChange={(v) => void toggle(v)} />
        <PressableScale onPress={() => router.push('/earnings')} accessibilityRole="button" accessibilityLabel="Today's earnings" style={[styles.earn, surfaceShadow]}>
          <Text variant="caption" color="textTertiary">Today</Text>
          <Text variant="label">{t ? rupees(t.total_earned) : '—'}</Text>
        </PressableScale>
      </View>

      <View style={styles.bottom} pointerEvents="box-none">
        <FloatButton icon="locate" label="Recenter map" onPress={() => map.current?.recenter()} style={styles.locate} />
        {notice && (
          <Animated.View entering={FadeIn} style={styles.notice}>
            <Icon name="information-circle" size="sm" color="onAccentSoft" />
            <Text variant="bodySmall" color="onAccentSoft" style={styles.flex}>{notice}</Text>
          </Animated.View>
        )}
        {a ? (
          <ActiveCard a={a} />
        ) : online ? (
          <Sheet>
            <View style={styles.searchRow}>
              <Pulse />
              <View style={styles.flex}>
                <Text variant="h3">Finding orders</Text>
                <Text variant="bodySmall" color="textSecondary">Stay close to busy restaurants</Text>
              </View>
            </View>
            <Stats trips={t?.total_deliveries} earned={t ? rupees(t.total_earned) : '—'} cash={t ? rupees(t.cash_in_hand) : '—'} />
          </Sheet>
        ) : (
          <Sheet>
            <View>
              <Text variant="h2">You're offline</Text>
              <Text variant="bodySmall" color="textSecondary">Go online to receive delivery requests.</Text>
            </View>
            <Button label="Go online" icon="power" onPress={() => void toggle(true)} loading={pending === true} fullWidth />
            <Stats trips={t?.total_deliveries} earned={t ? rupees(t.total_earned) : '—'} cash={t ? rupees(t.cash_in_hand) : '—'} />
          </Sheet>
        )}
      </View>

      {/* Offers wait while the delivery / success screen is on top, so they never cover it. */}
      {offer && !a && pathname !== '/delivery' && (
        <OfferSheet offer={offer} accepting={busyOffer === 'accept'} rejecting={busyOffer === 'reject'} onAccept={() => void accept(offer)} onReject={() => void reject(offer)} />
      )}
    </View>
  );
}

function Stats({ trips, earned, cash }: { trips: number | undefined; earned: string; cash: string }) {
  return (
    <View style={styles.stats}>
      <Stat label="Trips" value={trips === undefined ? '—' : String(trips)} />
      <View style={styles.divider} />
      <Stat label="Earned" value={earned} />
      <View style={styles.divider} />
      <Stat label="Cash" value={cash} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="h3" style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text variant="caption" color="textTertiary">{label}</Text>
    </View>
  );
}

function ActiveCard({ a }: { a: Assignment }) {
  const toCustomer = a.status === 'picked_up' || a.status === 'arrived_at_customer';
  return (
    <Sheet>
      <View style={styles.activeHead}>
        <View style={styles.liveTag}>
          <View style={styles.liveDot} />
          <Text variant="caption" color="primary">{a.order.order_number}</Text>
        </View>
        <Text variant="label" color="success">{rupees(a.estimated_payout)}</Text>
      </View>
      <View style={styles.activeBody}>
        <View style={[styles.activeIcon, { backgroundColor: toCustomer ? '#E7EFEB' : colors.primarySoft }]}>
          <Icon name={toCustomer ? 'home' : 'restaurant'} color={toCustomer ? 'secondaryMuted' : 'primary'} />
        </View>
        <View style={styles.flex}>
          <Text variant="h3">{STEP_LABEL[a.status] ?? 'Delivery'}</Text>
          <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
            {toCustomer ? `${a.drop.contact_name ?? 'Customer'} · ${a.drop.locality ?? ''}` : a.pickup.name}
          </Text>
        </View>
      </View>
      <Button label="Continue" icon="arrow-forward" iconPosition="end" onPress={() => router.push('/delivery')} fullWidth />
    </Sheet>
  );
}

function Pulse() {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 1600 }), -1, false);
  }, [v]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: 1 + v.value * 1.4 }], opacity: 1 - v.value }));
  return (
    <View style={styles.pulse}>
      <Animated.View style={[styles.pulseRing, ring]} />
      <View style={styles.pulseDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  earn: { minWidth: 76, height: 46, paddingHorizontal: spacing.md, borderRadius: 23, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.md, gap: spacing.md },
  locate: { alignSelf: 'flex-end' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.accentSoft },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stats: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  pulse: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: colors.success },
  pulseDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.success, borderWidth: 3, borderColor: colors.surface },
  activeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  activeBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  activeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
