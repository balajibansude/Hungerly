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
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BillSummary } from '@/features/cart/components/BillSummary';
import { CartLineItem } from '@/features/cart/components/CartLineItem';
import { useCartStore } from '@/features/cart/store';
import { useCartSummary } from '@/features/cart/useCartSummary';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { restaurant, items, bill } = useCartSummary();
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const clear = useCartStore((s) => s.clear);
  const [confirmClear, setConfirmClear] = useState(false);
  const [checkoutInfo, setCheckoutInfo] = useState(false);

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

  const blocked = bill.shortOfMinimum !== null;

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
            <Text variant="label" color="primary">
              Add more items
            </Text>
          </Pressable>
        </Card>

        {bill.shortOfOffer && restaurant.offer && (
          <Hint icon="pricetag-outline" tone="primarySoft">
            Add {formatMoney(bill.shortOfOffer)} more to unlock “{restaurant.offer.label}”.
          </Hint>
        )}

        <BillSummary bill={bill} offerLabel={restaurant.offer?.label} />

        <Hint icon="location-outline" tone="surfaceMuted">
          Delivery address, payment and order placement arrive with checkout in the next phases.
        </Hint>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {blocked && bill.shortOfMinimum && (
          <Text variant="bodySmall" color="warning" align="center">
            Add {formatMoney(bill.shortOfMinimum)} more to reach the{' '}
            {formatMoney(restaurant.minimumOrder)} minimum order.
          </Text>
        )}
        <Button
          label={`Checkout · ${formatMoney(bill.total)}`}
          onPress={() => setCheckoutInfo(true)}
          disabled={blocked}
          fullWidth
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
        visible={checkoutInfo}
        title="Checkout is coming soon"
        message="This prototype stops at the cart. Payments and order placement will be connected when the backend is ready."
        confirmLabel="Got it"
        cancelLabel={null}
        onCancel={() => setCheckoutInfo(false)}
        onConfirm={() => setCheckoutInfo(false)}
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
      <Icon name={icon} size="sm" color={tone === 'primarySoft' ? 'primary' : 'textSecondary'} />
      <Text
        variant="bodySmall"
        color={tone === 'primarySoft' ? 'primary' : 'textSecondary'}
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
