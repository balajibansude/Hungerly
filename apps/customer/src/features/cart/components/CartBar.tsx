import {
  colors,
  elevation,
  Icon,
  PressableScale,
  radius,
  screenGutter,
  spacing,
  Text,
} from '@hungerly/ui';
import { formatMoney } from '@hungerly/utils';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCartSummary } from '../useCartSummary';

/**
 * Floating "View cart" bar. Appears whenever the cart has items so checkout is always
 * one tap away, and slides in so the change is noticed.
 */
export function CartBar({ bottomInset = true }: { bottomInset?: boolean }) {
  const insets = useSafeAreaInsets();
  const { restaurant, bill } = useCartSummary();
  if (!restaurant || bill.itemCount === 0) return null;

  const itemsLabel = `${bill.itemCount} ${bill.itemCount === 1 ? 'item' : 'items'}`;

  return (
    <Animated.View
      entering={FadeInDown.duration(250)}
      exiting={FadeOutDown.duration(200)}
      style={[styles.wrapper, { paddingBottom: (bottomInset ? insets.bottom : 0) + spacing.md }]}
      pointerEvents="box-none"
    >
      <PressableScale
        onPress={() => router.push('/cart')}
        accessibilityRole="button"
        accessibilityLabel={`View cart: ${itemsLabel} from ${restaurant.name}, ${formatMoney(bill.subtotal)}`}
        style={styles.bar}
      >
        <View style={styles.flex}>
          <Text variant="label" color="onPrimary">
            {itemsLabel} · {formatMoney(bill.subtotal)}
          </Text>
          <Text variant="caption" color="onPrimary" numberOfLines={1} style={styles.muted}>
            From {restaurant.name}
          </Text>
        </View>
        <Text variant="button" color="onPrimary">
          View cart
        </Text>
        <Icon name="chevron-forward" color="onPrimary" />
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: screenGutter },
  bar: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    ...elevation.high,
  },
  flex: { flex: 1 },
  muted: { opacity: 0.9 },
});

/** Space to reserve at the end of scrollable content so the CartBar never hides it. */
export const CART_BAR_SPACE = 96;
