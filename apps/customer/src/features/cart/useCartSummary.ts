import { zeroMoney } from '@hungerly/utils';
import { useMemo } from 'react';

import { computeBill } from './pricing';
import { useCartStore } from './store';

/** Cart contents plus the (estimated) bill, recomputed only when the cart changes. */
export function useCartSummary() {
  const restaurant = useCartStore((s) => s.restaurant);
  const items = useCartStore((s) => s.items);

  const bill = useMemo(
    () =>
      computeBill({
        items,
        deliveryFee: restaurant?.deliveryFee ?? zeroMoney(),
        minimumOrder: restaurant?.minimumOrder ?? zeroMoney(),
        offer: restaurant?.offer,
      }),
    [items, restaurant],
  );

  return { restaurant, items, bill };
}
