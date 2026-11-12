import type { Food, SelectedOption } from '@hungerly/types';
import { ConfirmDialog } from '@hungerly/ui';
import { useCallback, useState } from 'react';

import { blockedMessage } from '../food/availability';
import { useCartStore, type AddResult, type CartRestaurant } from './store';

interface PendingAdd {
  food: Food;
  restaurant: CartRestaurant;
  options: SelectedOption[];
  quantity: number;
  onAdded?: () => void;
}

/**
 * Adds to cart and, when the cart belongs to another restaurant, asks before replacing
 * it (FR-CART-1). If the cart refuses the dish (restaurant closed, dish unavailable) the
 * customer is told why. Render the returned `dialog` once in the screen.
 */
export function useAddToCart() {
  const addItem = useCartStore((s) => s.addItem);
  const currentRestaurantName = useCartStore((s) => s.restaurant?.name);
  const [pending, setPending] = useState<PendingAdd | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const handle = useCallback((input: PendingAdd, result: AddResult) => {
    if (result === 'added') input.onAdded?.();
    else if (result === 'conflict') setPending(input);
    else
      setRefusal(
        blockedMessage(
          result === 'closed' ? 'restaurant_closed' : 'dish_unavailable',
          input.restaurant,
        ),
      );
  }, []);

  const add = useCallback((input: PendingAdd) => handle(input, addItem(input)), [addItem, handle]);

  const dialog = (
    <>
      <ConfirmDialog
        visible={pending !== null}
        title="Start a new cart?"
        message={`Your cart has items from ${currentRestaurantName ?? 'another restaurant'}. Adding this will remove them.`}
        confirmLabel="Start new cart"
        cancelLabel="Keep cart"
        destructive
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const input = pending;
          setPending(null);
          if (input) handle(input, addItem({ ...input, replace: true }));
        }}
      />
      <ConfirmDialog
        visible={refusal !== null}
        title="Can't add this item"
        message={refusal ?? ''}
        confirmLabel="OK"
        cancelLabel={null}
        onCancel={() => setRefusal(null)}
        onConfirm={() => setRefusal(null)}
      />
    </>
  );

  return { add, dialog };
}

export type AddToCart = ReturnType<typeof useAddToCart>['add'];
