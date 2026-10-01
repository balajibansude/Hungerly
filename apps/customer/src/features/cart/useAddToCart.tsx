import type { Food, SelectedOption } from '@hungerly/types';
import { ConfirmDialog } from '@hungerly/ui';
import { useCallback, useState } from 'react';

import { useCartStore, type CartRestaurant } from './store';

interface PendingAdd {
  food: Food;
  restaurant: CartRestaurant;
  options: SelectedOption[];
  quantity: number;
  onAdded?: () => void;
}

/**
 * Adds to cart and, when the cart belongs to another restaurant, asks before replacing
 * it (FR-CART-1). Render the returned `dialog` once in the screen.
 */
export function useAddToCart() {
  const addItem = useCartStore((s) => s.addItem);
  const currentRestaurantName = useCartStore((s) => s.restaurant?.name);
  const [pending, setPending] = useState<PendingAdd | null>(null);

  const add = useCallback(
    (input: PendingAdd) => {
      const result = addItem(input);
      if (result === 'conflict') {
        setPending(input);
      } else {
        input.onAdded?.();
      }
    },
    [addItem],
  );

  const dialog = (
    <ConfirmDialog
      visible={pending !== null}
      title="Start a new cart?"
      message={`Your cart has items from ${currentRestaurantName ?? 'another restaurant'}. Adding this will remove them.`}
      confirmLabel="Start new cart"
      cancelLabel="Keep cart"
      destructive
      onCancel={() => setPending(null)}
      onConfirm={() => {
        if (pending) {
          addItem({ ...pending, replace: true });
          pending.onAdded?.();
        }
        setPending(null);
      }}
    />
  );

  return { add, dialog };
}

export type AddToCart = ReturnType<typeof useAddToCart>['add'];
