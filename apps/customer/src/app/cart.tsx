import {
  Button,
  Card,
  colors,
  ConfirmDialog,
  Divider,
  EmptyState,
  Icon,
  radius,
  Screen,
  ScreenHeader,
  screenGutter,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { useQuery } from '@hungerly/app-core';
import type { PaymentMethod } from '@hungerly/types';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSessionStore } from '@/features/auth/session';
import { checkoutStepFor } from '@/features/cart/checkout';
import { BillSummary } from '@/features/cart/components/BillSummary';
import { CartLineItem } from '@/features/cart/components/CartLineItem';
import { useCartStore } from '@/features/cart/store';
import { useCartSummary } from '@/features/cart/useCartSummary';
import {
  DeliveryAddressCard,
  type DeliveryAddressCardState,
} from '@/features/checkout/components/DeliveryAddressCard';
import { CheckoutSummary } from '@/features/checkout/components/CheckoutSummary';
import { PaymentMethodCard } from '@/features/checkout/components/PaymentMethodCard';
import { checkoutSummaryText } from '@/features/checkout/summary';
import { useDeliveryAddress } from '@/features/checkout/useDeliveryAddress';
import { opensAtLabel } from '@/features/food/availability';
import { useSyncCartAvailability } from '@/features/food/useDishCartControls';
import { placeOrderAndConfirm } from '@/features/orders/flow';
import { usePlacedOrdersStore } from '@/features/orders/store';
import { useServices, userMessage } from '@/services';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { restaurant, items, bill } = useCartSummary();
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const clear = useCartStore((s) => s.clear);
  const recordOrder = usePlacedOrdersStore((s) => s.add);
  const [confirmClear, setConfirmClear] = useState(false);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [notice, setNotice] = useState<string | null>(null);
  // Guards against a double tap creating two orders; the ref is checked synchronously.
  const placingRef = useRef(false);
  const [placing, setPlacing] = useState(false);
  const isSignedIn = useSessionStore((s) => s.session !== null);
  const delivery = useDeliveryAddress();
  const { restaurants, orders } = useServices();
  // Re-check the restaurant when the cart opens: it may have closed (or reopened) since
  // the items were added. The server checks again when the order is placed.
  const fresh = useQuery(`cart-restaurant:${restaurant?.id ?? 'none'}`, () =>
    restaurant ? restaurants.get(restaurant.id) : Promise.resolve(null),
  );
  useSyncCartAvailability(fresh.status === 'success' && fresh.data ? [fresh.data] : undefined);

  if (!restaurant || items.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="Cart" onBack={() => router.back()} />
        <EmptyState
          icon="bag-handle-outline"
          title="Your cart is empty"
          message="Add dishes from any restaurant and they'll show up here."
          actionLabel="Browse restaurants"
          onAction={() => router.replace('/restaurants')}
        />
      </Screen>
    );
  }

  const closed = !restaurant.isOpen;
  const blocked = bill.shortOfMinimum !== null || closed;

  const deliveryState: DeliveryAddressCardState = !isSignedIn
    ? { kind: 'guest' }
    : delivery.status === 'success'
      ? delivery.choice
      : { kind: delivery.status };

  const changeAddress = () => router.push({ pathname: '/addresses', params: { select: '1' } });
  // From checkout, a newly added address becomes the delivery address.
  const addAddress = () => router.push({ pathname: '/address-form', params: { select: '1' } });
  const editAddress = (id: string) => router.push({ pathname: '/address-form', params: { id } });

  const chosenAddress =
    deliveryState.kind === 'ready' || deliveryState.kind === 'incomplete'
      ? deliveryState.address
      : null;
  const summary = checkoutSummaryText({
    address: chosenAddress,
    paymentMethod,
    total: bill.total,
  });

  const placeOrder = () => {
    setNotice(null);
    const step = checkoutStepFor({
      isSignedIn,
      belowMinimum: bill.shortOfMinimum !== null,
      restaurantClosed: closed,
      hasDeliveryAddress: deliveryState.kind === 'ready',
    });
    if (step === 'login_required') setLoginPrompt(true);
    else if (step === 'address_required') {
      // Take the customer straight to what is missing.
      if (deliveryState.kind === 'incomplete') editAddress(deliveryState.address.id);
      else if (deliveryState.kind === 'none') addAddress();
      else if (deliveryState.kind === 'error') delivery.refetch();
    } else if (step === 'ready' && deliveryState.kind === 'ready' && !placingRef.current) {
      placingRef.current = true;
      setPlacing(true);
      // Instructions are added after the order exists (Confirmation → Instructions).
      placeOrderAndConfirm({
        orders,
        input: {
          restaurantId: restaurant.id,
          items,
          deliveryAddressId: deliveryState.address.id,
          paymentMethod,
          total: bill.total,
        },
        recordOrder,
        clearCart: clear,
        replace: (route) => router.replace(route),
      })
        .catch((error: unknown) => setNotice(userMessage(error)))
        .finally(() => {
          placingRef.current = false;
          setPlacing(false);
        });
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Cart"
        subtitle={restaurant.name}
        onBack={() => router.back()}
        actions={
          <Pressable
            onPress={() => setConfirmClear(true)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear cart"
          >
            <Text variant="label" color="error">
              Clear
            </Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.items}>
          {items.map((item, index) => (
            <View key={item.lineId}>
              {index > 0 && <Divider />}
              <CartLineItem
                item={item}
                canIncrease={!closed}
                onIncrement={() => increment(item.lineId)}
                onDecrement={() => decrement(item.lineId)}
              />
            </View>
          ))}
          <Divider />
          <Pressable
            onPress={() =>
              router.push({ pathname: '/restaurants/[id]', params: { id: restaurant.id } })
            }
            accessibilityRole="button"
            style={styles.addMore}
          >
            <Icon name="add-circle-outline" color="primary" />
            <Text variant="label" color="primaryText">
              Add more items
            </Text>
          </Pressable>
        </Card>

        {bill.shortOfOffer && restaurant.offer && (
          <Hint icon="pricetag-outline" tone="primarySoft">
            Add {formatMoney(bill.shortOfOffer)} more to unlock “{restaurant.offer.label}”.
          </Hint>
        )}

        <DeliveryAddressCard
          state={deliveryState}
          onChange={changeAddress}
          onAdd={addAddress}
          onEdit={editAddress}
          onLogin={() => setLoginPrompt(true)}
          onRetry={delivery.refetch}
        />

        <BillSummary bill={bill} offerLabel={restaurant.offer?.label} />

        <PaymentMethodCard value={paymentMethod} onChange={setPaymentMethod} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <CheckoutSummary summary={summary} onChangeAddress={changeAddress} />
        {closed && (
          <Text variant="bodySmall" color="warning" align="center">
            {restaurant.name} is currently closed
            {opensAtLabel(restaurant.opensAt) ? ` · ${opensAtLabel(restaurant.opensAt)}` : ''}. You
            can remove items, but can’t add more or check out until it reopens.
          </Text>
        )}
        {!closed && bill.shortOfMinimum && (
          <Text variant="bodySmall" color="warning" align="center">
            Add {formatMoney(bill.shortOfMinimum)} more to reach the{' '}
            {formatMoney(restaurant.minimumOrder)} minimum order.
          </Text>
        )}
        {!blocked && isSignedIn && deliveryState.kind === 'none' && (
          <Text variant="bodySmall" color="textSecondary" align="center">
            Add a delivery address to place your order.
          </Text>
        )}
        {notice && (
          <Text
            variant="bodySmall"
            color="textSecondary"
            align="center"
            accessibilityLiveRegion="polite"
          >
            {notice}
          </Text>
        )}
        <Button
          label={summary.placeOrderLabel}
          accessibilityLabel={summary.placeOrderAccessibilityLabel}
          onPress={placeOrder}
          disabled={blocked}
          loading={placing}
          fullWidth
          testID="place-order"
        />
      </View>

      <ConfirmDialog
        visible={confirmClear}
        title="Clear your cart?"
        message={`All items from ${restaurant.name} will be removed.`}
        confirmLabel="Clear cart"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          clear();
        }}
      />
      <ConfirmDialog
        visible={loginPrompt}
        title="Log in to place your order"
        message="You can browse and build a cart as a guest. To place an order we need to verify your mobile number — your cart stays exactly as it is."
        confirmLabel="Log in or sign up"
        cancelLabel="Not now"
        onCancel={() => setLoginPrompt(false)}
        onConfirm={() => {
          setLoginPrompt(false);
          router.push({ pathname: '/login', params: { reason: 'checkout' } });
        }}
      />
    </Screen>
  );
}

function Hint({
  icon,
  tone,
  children,
}: {
  icon: 'pricetag-outline' | 'location-outline';
  tone: 'primarySoft' | 'surfaceMuted';
  children: string | string[];
}) {
  return (
    <View style={[styles.hint, { backgroundColor: colors[tone] }]}>
      <Icon
        name={icon}
        size="sm"
        color={tone === 'primarySoft' ? 'primaryText' : 'textSecondary'}
      />
      <Text
        variant="bodySmall"
        color={tone === 'primarySoft' ? 'primaryText' : 'textSecondary'}
        style={styles.flex}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing['2xl'], gap: spacing.lg },
  items: { paddingHorizontal: spacing.lg },
  addMore: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  flex: { flex: 1 },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: screenGutter,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
