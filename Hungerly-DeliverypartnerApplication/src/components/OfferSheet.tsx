import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, SlideInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, Icon, type IconName, radius, spacing, Text } from '@/ui';

import { km, rupees } from '../lib/format';
import type { Assignment } from '../lib/types';
import { SlideToConfirm } from './SlideToConfirm';

/** Incoming order: payout first, a draining timer, the two stops, swipe to accept. Closes itself on expiry. */
export function OfferSheet({
  offer,
  accepting,
  rejecting,
  onAccept,
  onReject,
}: {
  offer: Assignment;
  accepting: boolean;
  rejecting: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const insets = useSafeAreaInsets();
  const expires = offer.offer_expires_at ? new Date(offer.offer_expires_at).getTime() : Date.now() + 45_000;
  const [left, setLeft] = useState(Math.max(0, Math.ceil((expires - Date.now()) / 1000)));
  const progress = useSharedValue(1);

  useEffect(() => {
    const total = Math.max(1, expires - Date.now());
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Vibration.vibrate([0, 300, 200, 300]);
    progress.value = withTiming(0, { duration: total, easing: Easing.linear });
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((expires - Date.now()) / 1000))), 250);
    return () => {
      clearInterval(t);
      Vibration.cancel();
    };
  }, [offer.id, expires, progress]);

  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const urgent = left <= 10;
  if (left === 0) return null;

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={onReject}>
      {/* Android: gestures inside a Modal need their own gesture root, or the swipe never registers. */}
      <GestureHandlerRootView style={styles.flex}>
      <Animated.View entering={FadeIn.duration(200)} style={styles.scrim} pointerEvents="none" />
      <Animated.View entering={SlideInDown.springify().damping(18)} style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.timerTrack}>
          <Animated.View style={[styles.timerFill, bar, urgent && { backgroundColor: colors.error }]} />
        </View>

        <View style={styles.head}>
          <View>
            <Text variant="caption" color="textTertiary">New order · earn</Text>
            <Text variant="display">{rupees(offer.estimated_payout)}</Text>
          </View>
          <View style={[styles.timer, urgent && { borderColor: colors.error }]}>
            <Text variant="h3" color={urgent ? 'error' : 'textPrimary'}>{left}s</Text>
          </View>
        </View>

        <View style={styles.route}>
          <Stop icon="restaurant" tone={colors.primary} title={offer.pickup.name} meta={`${km(offer.pickup_distance_m)} away`} />
          <View style={styles.connector} />
          <Stop icon="home" tone={colors.secondary} title={offer.drop.locality ?? 'Customer'} meta={`${km(offer.drop_distance_m)} trip`} />
        </View>

        <View style={styles.chips}>
          <Chip icon="bag-handle-outline" label={`${offer.order.item_count} items`} />
          {offer.order.payment_method === 'cod' ? <Chip icon="cash-outline" label={`Collect ${rupees(offer.order.cash_to_collect)}`} /> : <Chip icon="card-outline" label="Prepaid" />}
        </View>

        <SlideToConfirm label="Swipe to accept" onConfirm={onAccept} loading={accepting} disabled={left === 0} />
        <Pressable onPress={onReject} disabled={rejecting || accepting} style={styles.decline} accessibilityRole="button" hitSlop={8}>
          <Text variant="label" color="textSecondary">{rejecting ? 'Declining…' : 'Decline'}</Text>
        </Pressable>
      </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Stop({ icon, tone, title, meta }: { icon: IconName; tone: string; title: string; meta: string }) {
  return (
    <View style={styles.stop}>
      <View style={[styles.stopIcon, { backgroundColor: tone }]}>
        <Icon name={icon} size="sm" color="onPrimary" />
      </View>
      <Text variant="h3" numberOfLines={1} style={styles.flex}>{title}</Text>
      <Text variant="caption" color="textTertiary">{meta}</Text>
    </View>
  );
}

function Chip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.chip}>
      <Icon name={icon} size="sm" color="textSecondary" />
      <Text variant="label" color="textSecondary">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22,36,31,0.28)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.modal,
    borderTopRightRadius: radius.modal,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.lg,
    overflow: 'hidden',
  },
  timerTrack: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: colors.surfaceMuted },
  timerFill: { height: 4, backgroundColor: colors.accent },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timer: { width: 58, height: 58, borderRadius: 29, borderWidth: 3, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  route: { padding: spacing.lg, borderRadius: radius.card, backgroundColor: colors.surfaceMuted },
  stop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stopIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  connector: { width: 2, height: 16, marginLeft: 14, marginVertical: 4, backgroundColor: colors.borderStrong },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  decline: { alignSelf: 'center', paddingVertical: spacing.xs },
});
