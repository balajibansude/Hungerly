import type { Food, Restaurant } from '@hungerly/types';
import { router } from 'expo-router';
import { useCallback } from 'react';

import { lineIdFor, quantityOfFood, toCartRestaurant, useCartStore } from '../cart/store';
import type { AddToCart } from '../cart/useAddToCart';

/**
 * Stepper behaviour for menu rows:
 * - simple dishes: + and − change the cart directly;
 * - customisable dishes: + opens the dish sheet (the customer must pick options);
 *   − decrements when there is a single variant, otherwise opens the cart so the
 *   customer chooses which variant to remove.
 */
export function useMenuItemControls(restaurant: Restaurant | undefined, add: AddToCart) {
  const items = useCartStore((s) => s.items);
  const decrement = useCartStore((s) => s.decrement);

  return useCallback(
    (food: Food) => {
      const customisable = food.optionGroups.length > 0;
      const quantity = quantityOfFood(items, food.id);
      const openDetails = () => router.push({ pathname: '/food/[id]', params: { id: food.id } });

      const onIncrement = () => {
        if (customisable || !restaurant) return openDetails();
        add({ food, restaurant: toCartRestaurant(restaurant), options: [], quantity: 1 });
      };

      const onDecrement = () => {
        const lines = items.filter((item) => item.foodId === food.id);
        if (lines.length === 1 && lines[0]) return decrement(lines[0].lineId);
        if (!customisable) return decrement(lineIdFor(food.id, []));
        router.push('/cart');
      };

      return { quantity, onIncrement, onDecrement, openDetails };
    },
    [items, restaurant, add, decrement],
  );
}
