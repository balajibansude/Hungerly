import type { CartItem, Food, Id, Restaurant, SelectedOption } from '@hungerly/types';
import { create } from 'zustand';

/** Maximum quantity per line, matching `cart_items.quantity` CHECK 1..50 (kept lower for UX). */
export const MAX_LINE_QUANTITY = 20;

export interface CartRestaurant {
  id: Id;
  name: string;
  deliveryFee: Restaurant['deliveryFee'];
  minimumOrder: Restaurant['minimumOrder'];
  offer?: Restaurant['offer'];
  /** Latest known availability; refreshed by `syncAvailability` whenever screens load it. */
  isOpen: boolean;
  opensAt?: Restaurant['opensAt'];
}

/**
 * `closed` / `unavailable`: nothing was added. The cart enforces this itself, so a stale
 * or mis-rendered button can never add a dish from a closed restaurant. The server
 * validates again when the order is placed.
 */
export type AddResult = 'added' | 'conflict' | 'closed' | 'unavailable';

interface CartState {
  restaurant: CartRestaurant | null;
  items: CartItem[];
  /**
   * Adds an item. Returns 'conflict' when the cart holds another restaurant's items and
   * `replace` is false — the UI then asks the customer before discarding their cart.
   */
  addItem: (input: {
    food: Food;
    restaurant: CartRestaurant;
    options: SelectedOption[];
    quantity: number;
    replace?: boolean;
  }) => AddResult;
  /** No-op while the cart's restaurant is closed. */
  increment: (lineId: string) => void;
  /** Always allowed: customers can remove items even while the restaurant is closed. */
  decrement: (lineId: string) => void;
  /** Updates the cart restaurant's open state from fresher data; ignores other restaurants. */
  syncAvailability: (
    restaurantId: Id,
    availability: Pick<CartRestaurant, 'isOpen' | 'opensAt'>,
  ) => void;
  remove: (lineId: string) => void;
  clear: () => void;
}

/** Identical food + options share one line, so re-adding increases quantity. */
export function lineIdFor(foodId: Id, options: SelectedOption[]): string {
  const optionIds = options.map((o) => o.optionId).sort();
  return [foodId, ...optionIds].join('|');
}

function clamp(quantity: number): number {
  return Math.max(0, Math.min(MAX_LINE_QUANTITY, quantity));
}

export const useCartStore = create<CartState>()((set, get) => ({
  restaurant: null,
  items: [],

  addItem: ({ food, restaurant, options, quantity, replace = false }) => {
    if (!restaurant.isOpen) return 'closed';
    if (!food.isAvailable) return 'unavailable';
    const current = get();
    if (
      current.restaurant &&
      current.restaurant.id !== restaurant.id &&
      current.items.length > 0 &&
      !replace
    ) {
      return 'conflict';
    }
    const sameRestaurant = current.restaurant?.id === restaurant.id;
    const items = sameRestaurant ? current.items : [];
    const lineId = lineIdFor(food.id, options);
    const existing = items.find((item) => item.lineId === lineId);

    const nextItems = existing
      ? items.map((item) =>
          item.lineId === lineId ? { ...item, quantity: clamp(item.quantity + quantity) } : item,
        )
      : [
          ...items,
          {
            lineId,
            foodId: food.id,
            restaurantId: restaurant.id,
            name: food.name,
            foodType: food.foodType,
            image: food.image,
            basePrice: food.price,
            selectedOptions: options,
            quantity: clamp(quantity),
          },
        ];

    set({ restaurant, items: nextItems });
    return 'added';
  },

  increment: (lineId) =>
    set((state) =>
      state.restaurant?.isOpen
        ? {
            items: state.items.map((item) =>
              item.lineId === lineId ? { ...item, quantity: clamp(item.quantity + 1) } : item,
            ),
          }
        : state,
    ),

  syncAvailability: (restaurantId, { isOpen, opensAt }) =>
    set((state) => {
      const current = state.restaurant;
      if (!current || current.id !== restaurantId) return state;
      if (current.isOpen === isOpen && current.opensAt === opensAt) return state;
      return { restaurant: { ...current, isOpen, opensAt } };
    }),

  decrement: (lineId) =>
    set((state) => {
      const items = state.items
        .map((item) => (item.lineId === lineId ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0);
      return { items, restaurant: items.length > 0 ? state.restaurant : null };
    }),

  remove: (lineId) =>
    set((state) => {
      const items = state.items.filter((item) => item.lineId !== lineId);
      return { items, restaurant: items.length > 0 ? state.restaurant : null };
    }),

  clear: () => set({ restaurant: null, items: [] }),
}));

/** Total quantity of a food across all of its customised lines. */
export function quantityOfFood(items: CartItem[], foodId: Id): number {
  return items.reduce((total, item) => (item.foodId === foodId ? total + item.quantity : total), 0);
}

export function toCartRestaurant(restaurant: Restaurant): CartRestaurant {
  return {
    id: restaurant.id,
    name: restaurant.name,
    deliveryFee: restaurant.deliveryFee,
    minimumOrder: restaurant.minimumOrder,
    offer: restaurant.offer,
    isOpen: restaurant.isOpen,
    opensAt: restaurant.opensAt,
  };
}
