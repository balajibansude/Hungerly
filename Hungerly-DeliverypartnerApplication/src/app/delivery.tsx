import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RiderMap, type RiderMapHandle } from '@/components/RiderMap';
import { SlideToConfirm } from '@/components/SlideToConfirm';
import { FloatButton, surfaceShadow } from '@/components/Surface';
import { api, errorMessage } from '@/lib/api';
import { SUPPORT_PHONE } from '@/lib/config';
import { km, rupees, time } from '@/lib/format';
import { positionForAction, useRiderPosition } from '@/lib/location';
import { keys, useCurrentAssignment } from '@/lib/queries';
import type { Assignment, LatLng, Money } from '@/lib/types';
import { Button, colors, fontFamily, Icon, type IconName, LoadingState, radius, spacing, Text } from '@/ui';

const STEPS = ['accepted', 'arrived_at_restaurant', 'picked_up', 'arrived_at_customer'] as const;
const TITLES: Record<string, string> = {
  accepted: 'Go to restaurant',
  arrived_at_restaurant: 'Collect the order',
  picked_up: 'Go to customer',
  arrived_at_customer: 'Hand over',
};

const ISSUES: { kind: string; label: string; icon: IconName }[] = [
  { kind: 'restaurant_delay', label: 'Restaurant is delaying', icon: 'time-outline' },
  { kind: 'customer_unreachable', label: 'Customer not answering', icon: 'call-outline' },
  { kind: 'wrong_address', label: 'Wrong or incomplete address', icon: 'location-outline' },
  { kind: 'food_damaged', label: 'Food spilled or damaged', icon: 'alert-circle-outline' },
  { kind: 'vehicle_breakdown', label: 'Vehicle breakdown', icon: 'construct-outline' },
  { kind: 'accident', label: 'Accident or safety issue', icon: 'medkit-outline' },
];

/** Turn-by-turn in Google Maps (two-wheeler mode) or Apple Maps, with a web fallback. */
function navigate(to: LatLng) {
  const dest = `${to.lat},${to.lng}`;
  const url = Platform.OS === 'ios' ? `maps://?daddr=${dest}&dirflg=d` : `google.navigation:q=${dest}&mode=l`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving&dir_action=navigate`));
}

function call(phone: string | null | undefined) {
  if (phone) void Linking.openURL(`tel:${phone}`);
}

// Customer name, address and phone are on screen: block screenshots and screen recording (phones only;
// the browser design preview has no such API). Platform never changes at runtime, so this is hook-safe.
const usePrivacyScreen = Platform.OS === 'web' ? () => undefined : usePreventScreenCapture;

export default function Delivery() {
  usePrivacyScreen();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const qc = useQueryClient();
  const { data: a, isLoading } = useCurrentAssignment();
  const rider = useRiderPosition();
  const map = useRef<RiderMapHandle>(null);
  const [busy, setBusy] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const closedNotified = useRef(false);

  useEffect(() => {
    // The delivery can disappear if support cancels or reassigns it.
    if (!isLoading && !a && !done && !closedNotified.current) {
      closedNotified.current = true;
      Alert.alert('Delivery closed', 'This delivery was cancelled or reassigned by Hungerly support.');
      router.replace('/home');
    }
  }, [a, isLoading, done]);

  if (done) return <Success earned={done} />;
  if (!a) return <LoadingState label="Loading delivery" />;

  const step = async (path: string, body: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const location = await positionForAction();
      const res = await api<Assignment | { status: string; earned: Money }>(`/delivery/assignments/${a.id}/${path}`, { method: 'POST', body: { ...body, location } });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if ('earned' in res) {
        setDone(rupees(res.earned));
        qc.setQueryData(keys.current, null);
        void qc.invalidateQueries({ queryKey: keys.today });
        void qc.invalidateQueries({ queryKey: ['earnings'] });
        void qc.invalidateQueries({ queryKey: keys.history });
      } else {
        qc.setQueryData(keys.current, res);
      }
      return true;
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't update", errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const atRestaurant = a.status === 'accepted' || a.status === 'arrived_at_restaurant';
  const stepIndex = STEPS.indexOf(a.status as (typeof STEPS)[number]);
  const items = a.items ?? [];
  const sheetMax = height * 0.62;
  const target = atRestaurant ? a.pickup.location : a.drop.location;

  return (
    <View style={styles.root}>
      <RiderMap
        ref={map}
        rider={rider}
        pickup={a.pickup.location}
        drop={a.drop.location}
        leg={atRestaurant ? 'pickup' : 'drop'}
        insets={{ top: insets.top + 60, bottom: Math.min(sheetMax, 380) }}
      />

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <FloatButton icon="chevron-down" label="Minimise" onPress={() => router.back()} />
        <View style={[styles.orderChip, surfaceShadow]}>
          <Text variant="label">{a.order.order_number}</Text>
          <Text variant="label" color="success">{rupees(a.estimated_payout)}</Text>
        </View>
        <FloatButton icon="help-buoy-outline" label="Report a problem" onPress={() => setIssueOpen(true)} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap} pointerEvents="box-none">
        <View style={styles.mapActions} pointerEvents="box-none">
          <FloatButton icon="locate" label="Recenter map" onPress={() => map.current?.recenter()} />
          {target && <FloatButton icon="navigate" label="Navigate" tone="dark" onPress={() => navigate(target)} />}
        </View>
        <View style={[styles.sheet, surfaceShadow, { maxHeight: sheetMax, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.progress}>
            {STEPS.map((s, i) => (
              <View key={s} style={[styles.progressBar, i <= stepIndex && { backgroundColor: colors.primary }]} />
            ))}
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Animated.View key={a.status} entering={FadeInDown.duration(280)} style={styles.gap}>
              <Text variant="h2">{TITLES[a.status] ?? 'Delivery'}</Text>

              {atRestaurant ? (
                <Place
                  icon="restaurant"
                  tone="primary"
                  title={a.pickup.name}
                  sub={a.pickup.address}
                  meta={a.order.estimated_ready_at ? `Ready ~${time(a.order.estimated_ready_at)}` : undefined}
                  onCall={a.pickup.phone_e164 ? () => call(a.pickup.phone_e164) : undefined}
                  onNavigate={() => navigate(a.pickup.location)}
                />
              ) : (
                <Place
                  icon="home"
                  tone="secondary"
                  title={a.drop.contact_name ?? 'Customer'}
                  sub={[a.drop.line1, a.drop.line2, a.drop.landmark, a.drop.locality].filter(Boolean).join(', ')}
                  meta={a.drop_distance_m ? km(a.drop_distance_m) : undefined}
                  note={a.drop.instructions}
                  onCall={a.drop.contact_phone_e164 ? () => call(a.drop.contact_phone_e164) : undefined}
                  onNavigate={a.drop.location ? () => navigate(a.drop.location!) : undefined}
                />
              )}

              {a.status === 'arrived_at_restaurant' && (
                <View style={styles.block}>
                  <View style={styles.rowBetween}>
                    <Text variant="label" color="textSecondary">Check items · {a.order.order_number}</Text>
                    <Text variant="label" color={picked.size === items.length ? 'success' : 'textTertiary'}>
                      {picked.size}/{items.length}
                    </Text>
                  </View>
                  {items.map((it, i) => {
                    const on = picked.has(i);
                    return (
                      <Pressable
                        key={i}
                        style={styles.item}
                        onPress={() =>
                          setPicked((p) => {
                            const n = new Set(p);
                            if (n.has(i)) n.delete(i);
                            else n.add(i);
                            return n;
                          })
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                      >
                        <View style={[styles.check, on && styles.checkOn]}>{on && <Icon name="checkmark" size="sm" color="onPrimary" />}</View>
                        <Text variant="body" style={[styles.flex, on && styles.struck]}>
                          {it.quantity} × {it.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {!atRestaurant && (
                <View style={[styles.payment, a.order.payment_method === 'cod' ? styles.cod : styles.prepaid]}>
                  <Icon name={a.order.payment_method === 'cod' ? 'cash-outline' : 'checkmark-circle'} color={a.order.payment_method === 'cod' ? 'onAccentSoft' : 'success'} />
                  <Text variant="h3" color={a.order.payment_method === 'cod' ? 'textPrimary' : 'success'} style={styles.flex}>
                    {a.order.payment_method === 'cod' ? `Collect ${rupees(a.order.cash_to_collect, true)}` : 'Prepaid · no cash'}
                  </Text>
                </View>
              )}

              {a.status === 'accepted' && <SlideToConfirm label="Arrived at restaurant" onConfirm={() => void step('arrived-restaurant')} loading={busy} tone="secondary" />}
              {a.status === 'arrived_at_restaurant' && (
                <SlideToConfirm
                  label={picked.size === items.length ? 'Order picked up' : 'Check all items first'}
                  onConfirm={() => void step('picked-up')}
                  loading={busy}
                  disabled={picked.size !== items.length}
                />
              )}
              {a.status === 'picked_up' && <SlideToConfirm label="Arrived at customer" onConfirm={() => void step('arrived-customer')} loading={busy} tone="secondary" />}
              {a.status === 'arrived_at_customer' && (
                <Handover a={a} busy={busy} onSubmit={(otp, cod) => step('delivered', { delivery_otp: otp, cod_collected_minor: cod })} />
              )}
            </Animated.View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <IssueSheet visible={issueOpen} assignmentId={a.id} onClose={() => setIssueOpen(false)} />
    </View>
  );
}

function Place({
  icon,
  tone,
  title,
  sub,
  meta,
  note,
  onNavigate,
  onCall,
}: {
  icon: IconName;
  tone: 'primary' | 'secondary';
  title: string;
  sub: string;
  meta?: string;
  note?: string | null;
  onNavigate?: () => void;
  onCall?: () => void;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.placeRow}>
        <View style={[styles.placeIcon, { backgroundColor: tone === 'primary' ? colors.primarySoft : '#E7EFEB' }]}>
          <Icon name={icon} color={tone === 'primary' ? 'primary' : 'secondaryMuted'} />
        </View>
        <View style={styles.flex}>
          <Text variant="h3" numberOfLines={1}>{title}</Text>
          <Text variant="bodySmall" color="textSecondary" numberOfLines={2}>{sub}</Text>
          {meta && <Text variant="caption" color="textTertiary">{meta}</Text>}
        </View>
        {onCall && <RoundAction icon="call" label="Call" onPress={onCall} />}
        {onNavigate && <RoundAction icon="navigate" label="Navigate" onPress={onNavigate} dark />}
      </View>
      {note && (
        <View style={styles.note}>
          <Icon name="chatbubble-ellipses-outline" size="sm" color="onAccentSoft" />
          <Text variant="bodySmall" color="onAccentSoft" style={styles.flex}>{note}</Text>
        </View>
      )}
    </View>
  );
}

function RoundAction({ icon, label, onPress, dark }: { icon: IconName; label: string; onPress: () => void; dark?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={[styles.roundAction, dark && { backgroundColor: colors.secondary }]}>
      <Icon name={icon} size="md" color={dark ? 'onSecondary' : 'textPrimary'} />
    </Pressable>
  );
}

function Handover({ a, busy, onSubmit }: { a: Assignment; busy: boolean; onSubmit: (otp: string, cod: number | null) => Promise<boolean> }) {
  const [otp, setOtp] = useState('');
  const [cashOk, setCashOk] = useState(false);
  const input = useRef<TextInput>(null);
  const cod = a.order.payment_method === 'cod';
  const ready = otp.length === 4 && (!cod || cashOk);

  return (
    <View style={styles.gap}>
      <View style={styles.block}>
        <Text variant="label" color="textSecondary">Customer's 4-digit code</Text>
        <Pressable onPress={() => input.current?.focus()} style={styles.otpRow} accessibilityLabel="Delivery code">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.otpBox, i === otp.length && styles.otpFocus, !!otp[i] && styles.otpFilled]}>
              <Text variant="h1">{otp[i] ?? ''}</Text>
            </View>
          ))}
        </Pressable>
        <TextInput
          ref={input}
          value={otp}
          onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          autoFocus
          style={styles.hidden}
          autoComplete="off"
          importantForAutofill="no"
        />
        {cod && (
          <Pressable style={styles.item} onPress={() => setCashOk(!cashOk)} accessibilityRole="checkbox" accessibilityState={{ checked: cashOk }}>
            <View style={[styles.check, cashOk && styles.checkOn]}>{cashOk && <Icon name="checkmark" size="sm" color="onPrimary" />}</View>
            <Text variant="body" style={styles.flex}>Collected {rupees(a.order.cash_to_collect, true)}</Text>
          </Pressable>
        )}
      </View>
      <SlideToConfirm
        label={ready ? 'Complete delivery' : otp.length < 4 ? 'Enter the code' : 'Confirm cash'}
        tone="success"
        disabled={!ready}
        loading={busy}
        onConfirm={() =>
          void onSubmit(otp, cod ? a.order.cash_to_collect.amount_minor : null).then((ok) => {
            if (!ok) setOtp('');
          })
        }
      />
    </View>
  );
}

function IssueSheet({ visible, assignmentId, onClose }: { visible: boolean; assignmentId: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [sending, setSending] = useState<string | null>(null);
  const report = async (kind: string) => {
    setSending(kind);
    try {
      await api(`/delivery/assignments/${assignmentId}/issue`, { method: 'POST', body: { kind } });
      onClose();
      Alert.alert('Reported', 'Support has been notified.');
    } catch (e) {
      Alert.alert("Couldn't report", errorMessage(e));
    } finally {
      setSending(null);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.issueSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.grabber} />
        <Text variant="h2">Report a problem</Text>
        {ISSUES.map((i) => (
          <Pressable key={i.kind} style={styles.issue} onPress={() => void report(i.kind)} disabled={!!sending}>
            <Icon name={i.icon} color={i.kind === 'accident' ? 'error' : 'textSecondary'} />
            <Text variant="body" style={styles.flex}>{i.label}</Text>
            {sending === i.kind ? <Text variant="caption" color="textTertiary">Sending…</Text> : <Icon name="chevron-forward" size="sm" color="textTertiary" />}
          </Pressable>
        ))}
        <Button label="Call support" icon="call-outline" variant="outline" onPress={() => call(SUPPORT_PHONE)} fullWidth />
      </View>
    </Modal>
  );
}

function Success({ earned }: { earned: string }) {
  useEffect(() => {
    const t = setTimeout(() => router.replace('/home'), 2400);
    return () => clearTimeout(t);
  }, []);
  return (
    <Animated.View entering={FadeIn} style={styles.success}>
      <Animated.View entering={ZoomIn.springify().damping(10)} style={styles.successBadge}>
        <Icon name="checkmark" size="hero" color="onPrimary" />
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(250)} style={styles.successText}>
        <Text variant="h1" color="textInverse">Delivered</Text>
        <Text variant="display" style={styles.successEarn}>+{earned}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  gap: { gap: spacing.lg },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  orderChip: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', height: 46, paddingHorizontal: spacing.lg, borderRadius: 23, backgroundColor: colors.surface },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  mapActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.modal, borderTopRightRadius: radius.modal, paddingTop: spacing.md },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  sheetContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  block: { gap: spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  placeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  roundAction: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.success, borderColor: colors.success },
  struck: { color: colors.textTertiary, textDecorationLine: 'line-through' },
  payment: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg },
  cod: { backgroundColor: colors.accentSoft },
  prepaid: { backgroundColor: colors.successSoft },
  otpRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center', marginVertical: spacing.sm },
  otpBox: { width: 58, height: 66, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  otpFocus: { borderColor: colors.success, backgroundColor: colors.successSoft },
  otpFilled: { backgroundColor: colors.surface },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1, fontFamily: fontFamily.regular },
  scrim: { flex: 1, backgroundColor: colors.overlay },
  issueSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.modal, borderTopRightRadius: radius.modal, paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.xs },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  issue: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  success: { flex: 1, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', gap: spacing['2xl'] },
  successBadge: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  successText: { alignItems: 'center', gap: spacing.xs },
  successEarn: { color: colors.accent },
});
