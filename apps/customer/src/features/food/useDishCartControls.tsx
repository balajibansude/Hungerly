import type { Food, Restaurant } from '@hungerly/types';
import { ConfirmDialog } from '@hungerly/ui';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { lineIdFor, quantityOfFood, toCartRestaurant, useCartStore } from '../cart/store';
import { useAddToCart } from '../cart/useAddToCart';
import { blockedMessage, dishBlocker, type Availability } from './availability';

export interface DishCartControls {
  quantity: number;
  /** Set when nothing can be added right now. */
  blockedReason: string | null;
  onIncrement: () => void;
  onDecrement: () => void;
  /** Explains why the dish can't be added (gray add button). */
  onBlockedPress: () => void;
  openDetails: () => void;
}

/**
 * One set of cart rules for every dish card, wherever it is shown:
 * - simple dishes: + and − change the cart directly;
 * - customisable dishes: + opens the dish sheet (options must be chosen); − decrements
 *   when there is a single variant, otherwise opens the cart to choose which to remove;
 * - closed restaurant / unavailable dish: + explains why instead of adding; − still
 *   removes what is already in the cart.
 * Render the returned `dialog` once in the screen.
 */
export function useDishCartControls() {
  const items = useCartStore((s) => s.items);
  const decrement = useCartStore((s) => s.decrement);
  const { add, dialog: addDialog } = useAddToCart();
  const [info, setInfo] = useState<string | null>(null);

  const controlsFor = useCallback(
    (food: Food, restaurant: Restaurant): DishCartControls => {
      const blocker = dishBlocker(food, restaurant);
      const blockedReason = blocker ? blockedMessage(blocker, restaurant) : null;
      const customisable = food.optionGroups.length > 0;
      const quantity = quantityOfFood(items, food.id);
      const openDetails = () => router.push({ pathname: '/food/[id]', params: { id: food.id } });
      const explain = () => setInfo(blockedReason);

      const onIncrement = () => {
        if (blockedReason) return explain();
        if (customisable) return openDetails();
        add({ food, restaurant: toCartRestaurant(restaurant), options: [], quantity: 1 });
      };

      const onDecrement = () => {
        const lines = items.filter((item) => item.foodId === food.id);
        if (lines.length === 1 && lines[0]) return decrement(lines[0].lineId);
        if (!customisable) return decrement(lineIdFor(food.id, []));
        router.push('/cart');
      };

      return {
        quantity,
        blockedReason,
        onIncrement,
        onDecrement,
        onBlockedPress: explain,
        openDetails,
      };
    },
    [items, add, decrement],
  );

  const dialog = (
    <>
      {addDialog}
      <ConfirmDialog
        visible={info !== null}
        title="Not available right now"
        message={info ?? ''}
        confirmLabel="OK"
        cancelLabel={null}
        onCancel={() => setInfo(null)}
        onConfirm={() => setInfo(null)}
      />
    </>
  );

  return { controlsFor, dialog };
}

/**
 * Keeps the cart's copy of its restaurant's open state in step with the freshest data a
 * screen has loaded (listing, menu, cart refresh), so cart rules follow reopen/close.
 */
export function useSyncCartAvailability(
  restaurants: readonly (Availability & { id: string })[] | undefined,
) {
  const syncAvailability = useCartStore((s) => s.syncAvailability);
  const cartRestaurantId = useCartStore((s) => s.restaurant?.id);
  const match = cartRestaurantId
    ? restaurants?.find((restaurant) => restaurant.id === cartRestaurantId)
    : undefined;
  const isOpen = match?.isOpen;
  const opensAt = match?.opensAt;

  useEffect(() => {
    if (cartRestaurantId && isOpen !== undefined) {
      syncAvailability(cartRestaurantId, { isOpen, opensAt });
    }
  }, [cartRestaurantId, isOpen, opensAt, syncAvailability]);
}
