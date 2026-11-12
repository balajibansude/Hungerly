import type { Id, OrderSummary } from '@hungerly/types';
import { create } from 'zustand';

/**
 * Orders placed in this app session, so the confirmation, instructions and tracking screens
 * can show the order immediately after checkout without another request.
 */
interface PlacedOrdersState {
  orders: Record<Id, OrderSummary>;
  add: (order: OrderSummary) => void;
  reset: () => void;
}

export const usePlacedOrdersStore = create<PlacedOrdersState>()((set) => ({
  orders: {},
  add: (order) => set((s) => ({ orders: { ...s.orders, [order.id]: order } })),
  reset: () => set({ orders: {} }),
}));

export function usePlacedOrder(orderId: Id | undefined): OrderSummary | undefined {
  return usePlacedOrdersStore((s) => (orderId ? s.orders[orderId] : undefined));
}
