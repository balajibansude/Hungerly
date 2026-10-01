import { userMessage } from '@hungerly/app-core';
import type { OrderRejectReason, PartnerOrder } from '@hungerly/types';
import {
  Badge,
  Button,
  Card,
  Chip,
  colors,
  ErrorState,
  Icon,
  LoadingState,
  OrderStatusBadge,
  radius,
  Screen,
  ScreenHeader,
  screenGutter,
  spacing,
  Text,
  type IconName,
} from '@hungerly/ui';
import { formatDistance } from '@hungerly/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { activeMembership, useSessionStore } from '@/features/auth/session';
import { PREP_MINUTES_OPTIONS } from '@/features/onboarding/options';
import {
  itemCount,
  restaurantActionsFor,
  type RestaurantOrderAction,
} from '@/features/orders/board';
import { OrderActionSheet } from '@/features/orders/components/OrderActionSheet';
import { OrderBill } from '@/features/orders/components/OrderBill';
import { OrderItems } from '@/features/orders/components/OrderItems';
import { OrderTimeline } from '@/features/orders/components/OrderTimeline';
import {
  cancellationLabel,
  formatClock,
  formatDateTime,
  kitchenTiming,
  paymentLabel,
  REJECT_REASON_OPTIONS,
} from '@/features/orders/format';
import {
  fetchOrder,
  performOrderAction,
  type OrderActionInput,
} from '@/features/orders/operations';
import { useOrdersStore } from '@/features/orders/store';
import { useNow } from '@/features/orders/useOrderBoard';
import { useActiveRestaurant } from '@/features/restaurant/useActiveRestaurant';
import { useServices } from '@/services';

/** Restaurant default prep time when it is one of the offered choices; otherwise 20 min. */
function defaultPrepMinutes(avgPrepMinutes: number | undefined): number {
  return PREP_MINUTES_OPTIONS.find((m) => m === avgPrepMinutes) ?? 20;
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <Card style={styles.section}>
      <View style={styles.sectionTitle}>
        <Icon name={icon} color="textSecondary" />
        <Text variant="h3" accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </Card>
  );
}

const successNotice: Record<RestaurantOrderAction, (order: PartnerOrder) => string> = {
  accept: (order) =>
    `Accepted. Ready by ${order.estimatedReadyAt ? formatClock(order.estimatedReadyAt) : 'soon'}.`,
  markReady: () => 'Marked ready for pickup.',
  reject: (order) =>
    order.paymentStatus === 'refund_pending'
      ? 'Order rejected. The customer’s refund has started.'
      : 'Order rejected.',
};

/** R9 — order detail with the actions the restaurant may take now. */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders: service } = useServices();
  const restaurantId = useSessionStore((s) => activeMembership(s.session)?.restaurantId ?? null);
  const order = useOrdersStore((s) => (id ? s.byId[id] : undefined));
  const pending = useOrdersStore((s) => (id ? s.pending[id] : undefined));
  const restaurant = useActiveRestaurant();
  const now = useNow();

  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<RestaurantOrderAction | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [prepMinutes, setPrepMinutes] = useState<number | null>(null);
  const [reason, setReason] = useState<OrderRejectReason | null>(null);

  // Opened directly (not from the board): fetch this one order into the shared cache.
  useEffect(() => {
    if (order || !id || !restaurantId) return;
    fetchOrder(service, restaurantId, id).catch((e: unknown) => setFetchError(userMessage(e)));
  }, [order, id, restaurantId, service]);

  if (!order) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader onBack={() => router.back()} backLabel="Back to orders" />
        {fetchError ? (
          <ErrorState
            title="Couldn’t open this order"
            message={fetchError}
            actionLabel="Back to orders"
            onRetry={() => router.back()}
          />
        ) : (
          <LoadingState label="Loading order" />
        )}
      </Screen>
    );
  }

  const actions = restaurantActionsFor(order.status);
  const timing = kitchenTiming(order, now);
  const busy = pending !== undefined;
  const chosenPrep =
    prepMinutes ??
    defaultPrepMinutes(
      restaurant.status === 'success' ? restaurant.data.avgPrepMinutes : undefined,
    );

  const openSheet = (action: RestaurantOrderAction) => {
    setSheetError(null);
    setNotice(null);
    if (action === 'reject') setReason(null);
    setSheet(action);
  };

  const inputFor = (action: RestaurantOrderAction): OrderActionInput | null => {
    switch (action) {
      case 'accept':
        return { action, prepMinutes: chosenPrep };
      case 'reject':
        return reason ? { action, reason } : null;
      case 'markReady':
        return { action };
    }
  };

  const run = async (action: RestaurantOrderAction) => {
    const input = inputFor(action);
    if (!restaurantId || !input) return;
    setSheetError(null);
    const outcome = await performOrderAction(service, restaurantId, order.id, input);
    if (outcome.ok) {
      setSheet(null);
      setNotice({ tone: 'success', text: successNotice[action](outcome.order) });
      return;
    }
    if (outcome.reason === 'busy') return;
    // The order may have changed elsewhere; if this action no longer applies, close the sheet.
    const latest = useOrdersStore.getState().byId[order.id];
    if (!latest || !restaurantActionsFor(latest.status).includes(action)) {
      setSheet(null);
      setNotice({ tone: 'error', text: outcome.message });
    } else {
      setSheetError(outcome.message);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        onBack={() => router.back()}
        backLabel="Back to orders"
        title={`#${order.orderNumber}`}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <OrderStatusBadge status={order.status} audience="partner" />
              {timing && <Badge label={timing.label} tone={timing.tone} icon="time-outline" />}
            </View>
            <Text variant="body" color="textSecondary">
              Placed {formatDateTime(order.placedAt)}
            </Text>
            {order.status === 'preparing' && order.acceptedAt && order.prepMinutes && (
              <Text variant="body" color="textSecondary">
                Accepted at {formatClock(order.acceptedAt)} with {order.prepMinutes} min prep
              </Text>
            )}
            {order.status === 'cancelled' && (
              <Text variant="label" color="error">
                {cancellationLabel(order)}
                {order.cancelledAt ? ` · ${formatClock(order.cancelledAt)}` : ''}
              </Text>
            )}
          </View>

          {notice && (
            <View
              style={[styles.notice, notice.tone === 'error' && styles.noticeError]}
              accessibilityLiveRegion="polite"
            >
              <Icon
                name={notice.tone === 'success' ? 'checkmark-circle' : 'alert-circle-outline'}
                color={notice.tone === 'success' ? 'success' : 'error'}
              />
              <Text variant="label" style={styles.flex}>
                {notice.text}
              </Text>
            </View>
          )}

          {order.specialInstructions && (
            <View style={styles.instructions}>
              <Icon name="chatbubble-ellipses-outline" color="onAccentSoft" />
              <Text variant="body" color="onAccentSoft" style={styles.flex}>
                {order.specialInstructions}
              </Text>
            </View>
          )}

          <Section title={`Items (${itemCount(order)})`} icon="restaurant-outline">
            <OrderItems items={order.items} />
          </Section>

          <Section title="Bill" icon="receipt-outline">
            <OrderBill bill={order.bill} />
            <Text variant="bodySmall" color="textSecondary">
              {paymentLabel(order)}
            </Text>
          </Section>

          <Section title="Customer" icon="person-outline">
            <Text variant="body">{order.customer.firstName}</Text>
            <Text variant="bodySmall" color="textSecondary">
              {order.customer.phoneMasked}
            </Text>
          </Section>

          <Section title="Delivery" icon="bicycle-outline">
            <Text variant="body">
              {order.delivery.locality} · {formatDistance(order.delivery.distanceMeters)} away
            </Text>
            <Text variant="bodySmall" color="textSecondary">
              {order.delivery.rider
                ? `Rider: ${order.delivery.rider.name} · ${order.delivery.rider.phoneMasked}`
                : 'Rider not assigned yet'}
            </Text>
          </Section>

          <Section title="History" icon="time-outline">
            <OrderTimeline events={order.timeline} />
          </Section>
        </View>
      </ScrollView>

      {actions.length > 0 && (
        <View style={styles.footer}>
          <View style={[styles.column, styles.footerRow]}>
            {actions.includes('reject') && (
              <Button
                label="Reject"
                variant="outline"
                icon="close"
                onPress={() => openSheet('reject')}
                disabled={busy}
                style={styles.flex}
              />
            )}
            {actions.includes('accept') && (
              <Button
                label="Accept"
                icon="checkmark"
                onPress={() => openSheet('accept')}
                disabled={busy}
                style={styles.flex}
              />
            )}
            {actions.includes('markReady') && (
              <Button
                label="Mark ready"
                icon="bag-check-outline"
                onPress={() => openSheet('markReady')}
                disabled={busy}
                fullWidth
              />
            )}
          </View>
        </View>
      )}

      <OrderActionSheet
        visible={sheet === 'accept'}
        title="Accept order"
        message="How long until it’s ready? The customer and rider see this estimate."
        confirmLabel={`Accept · ${chosenPrep} min`}
        busy={pending === 'accept'}
        errorText={sheetError ?? undefined}
        onConfirm={() => run('accept')}
        onCancel={() => setSheet(null)}
      >
        <View style={styles.choices}>
          {PREP_MINUTES_OPTIONS.map((minutes) => (
            <Chip
              key={minutes}
              label={`${minutes} min`}
              selected={chosenPrep === minutes}
              onPress={() => setPrepMinutes(minutes)}
            />
          ))}
        </View>
      </OrderActionSheet>

      <OrderActionSheet
        visible={sheet === 'reject'}
        title="Reject this order?"
        message="The order will be cancelled and the customer told. This can’t be undone."
        confirmLabel="Reject order"
        destructive
        busy={pending === 'reject'}
        confirmDisabled={!reason}
        errorText={sheetError ?? undefined}
        onConfirm={() => run('reject')}
        onCancel={() => setSheet(null)}
      >
        <Text variant="label" color="textSecondary">
          Reason
        </Text>
        <View style={styles.choices}>
          {REJECT_REASON_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={reason === option.value}
              onPress={() => setReason(option.value)}
            />
          ))}
        </View>
      </OrderActionSheet>

      <OrderActionSheet
        visible={sheet === 'markReady'}
        title="Mark ready for pickup?"
        message="Confirm the food is packed and waiting at the counter."
        confirmLabel="Mark ready"
        busy={pending === 'markReady'}
        errorText={sheetError ?? undefined}
        onConfirm={() => run('markReady')}
        onCancel={() => setSheet(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing['3xl'] },
  column: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing.lg },
  summary: { gap: spacing.xs },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  section: { padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
  },
  noticeError: { backgroundColor: colors.errorSoft },
  instructions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  footer: {
    paddingHorizontal: screenGutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  footerRow: { flexDirection: 'row', gap: spacing.md },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
