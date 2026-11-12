import type { Order } from '@hungerly/api-client';
import { create } from 'zustand';

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

interface OrdersState {
  byId: Record<string, Order>;
  pending: Record<string, boolean>;
  load: LoadState;
  refreshing: boolean;
  restaurantId: string | null;
  startLoading: (restaurantId: string, mode: 'initial' | 'refresh') => void;
  setOrders: (orders: Order[], restaurantId: string) => void;
  setLoadError: (message: string) => void;
  setOrder: (order: Order) => void;
  setPending: (id: string, value: boolean) => void;
  reset: () => void;
}

const INITIAL: Omit<OrdersState, 'startLoading' | 'setOrders' | 'setLoadError' | 'setOrder' | 'setPending' | 'reset'> =
  {
    byId: {},
    pending: {},
    load: { status: 'idle' },
    refreshing: false,
    restaurantId: null,
  };

export const useOrdersStore = create<OrdersState>()((set) => ({
  ...INITIAL,

  startLoading(restaurantId, mode) {
    if (mode === 'initial') {
      set({ load: { status: 'loading' }, refreshing: false, restaurantId });
    } else {
      set({ refreshing: true });
    }
  },

  setOrders(orders, restaurantId) {
    const byId: Record<string, Order> = {};
    for (const o of orders) byId[o.id] = o;
    set({ byId, load: { status: 'ready' }, refreshing: false, restaurantId });
  },

  setLoadError(message) {
    set((s) => ({
      load: s.load.status === 'ready' ? { status: 'ready' } : { status: 'error', message },
      refreshing: false,
    }));
  },

  setOrder(order) {
    set((s) => ({ byId: { ...s.byId, [order.id]: order } }));
  },

  setPending(id, value) {
    set((s) => {
      const next = { ...s.pending };
      if (value) next[id] = true;
      else delete next[id];
      return { pending: next };
    });
  },

  reset() {
    set(INITIAL);
  },
}));
