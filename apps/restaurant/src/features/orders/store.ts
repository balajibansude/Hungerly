import type { Id, PartnerOrder } from '@hungerly/types';
import { create } from 'zustand';

import type { RestaurantOrderAction } from './board';

/**
 * The restaurant's orders as one shared cache, so the board, order detail (and later the
 * dashboard and alerts) always show the same version of an order. Filled and updated only
 * through `operations.ts`, which talks to the OrderService. In memory only.
 */
export type OrdersLoad =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

interface OrdersState {
  /** Whose orders are cached; another restaurant (or a new login) starts over. */
  restaurantId: Id | null;
  byId: Record<Id, PartnerOrder>;
  load: OrdersLoad;
  /** Pull-to-refresh in progress (existing orders stay visible). */
  refreshing: boolean;
  /** Actions in flight, per order — a second tap is ignored until the first finishes. */
  pending: Record<Id, RestaurantOrderAction>;

  startLoading: (restaurantId: Id, mode: 'initial' | 'refresh') => void;
  loaded: (restaurantId: Id, orders: PartnerOrder[]) => void;
  loadFailed: (message: string) => void;
  upsert: (order: PartnerOrder) => void;
  remove: (orderId: Id) => void;
  setPending: (orderId: Id, action: RestaurantOrderAction | null) => void;
  reset: () => void;
}

const initial = {
  restaurantId: null,
  byId: {},
  load: { status: 'idle' } as OrdersLoad,
  refreshing: false,
  pending: {},
};

export const useOrdersStore = create<OrdersState>()((set) => ({
  ...initial,

  startLoading: (restaurantId, mode) =>
    set((state) =>
      state.restaurantId !== restaurantId || mode === 'initial'
        ? { ...initial, restaurantId, load: { status: 'loading' } }
        : { refreshing: true },
    ),
  loaded: (restaurantId, orders) =>
    set((state) =>
      state.restaurantId !== restaurantId
        ? state
        : {
            byId: Object.fromEntries(orders.map((order) => [order.id, order])),
            load: { status: 'ready' },
            refreshing: false,
          },
    ),
  loadFailed: (message) =>
    set((state) =>
      // A failed refresh keeps the orders already on screen.
      state.load.status === 'ready'
        ? { refreshing: false }
        : { load: { status: 'error', message }, refreshing: false },
    ),
  upsert: (order) =>
    set((state) =>
      state.restaurantId !== order.restaurantId
        ? state
        : { byId: { ...state.byId, [order.id]: order } },
    ),
  remove: (orderId) =>
    set((state) => {
      const { [orderId]: _removed, ...rest } = state.byId;
      return { byId: rest };
    }),
  setPending: (orderId, action) =>
    set((state) => {
      const { [orderId]: _done, ...rest } = state.pending;
      return { pending: action ? { ...rest, [orderId]: action } : rest };
    }),
  reset: () => set(initial),
}));
