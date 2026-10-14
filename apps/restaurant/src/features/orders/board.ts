import type { Order, OrderStatus } from '@hungerly/api-client';
import { allowedTransitions } from '@hungerly/utils';

/**
 * The order board's sections. They group the database statuses (no second state model).
 * The live board shows the three kitchen sections; Completed and Cancelled are history.
 * Orders still awaiting online payment are never shown to the restaurant.
 */
export type BoardGroup = 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export const BOARD_GROUPS: { key: BoardGroup; label: string; statuses: OrderStatus[] }[] = [
  { key: 'new', label: 'New', statuses: ['placed'] },
  { key: 'preparing', label: 'Preparing', statuses: ['preparing'] },
  { key: 'ready', label: 'Ready for pickup', statuses: ['ready_for_pickup'] },
  { key: 'completed', label: 'Completed', statuses: ['picked_up', 'delivered'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
];

export const LIVE_GROUPS: BoardGroup[] = ['new', 'preparing', 'ready'];

export function boardGroupOf(status: OrderStatus): BoardGroup | null {
  return BOARD_GROUPS.find((group) => group.statuses.includes(status))?.key ?? null;
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);

/** When the kitchen promised the food: accepted time + prep minutes. */
export function readyByIso(order: Pick<Order, 'acceptedAt' | 'prepMinutes'>): string | null {
  if (!order.acceptedAt || !order.prepMinutes) return null;
  return new Date(Date.parse(order.acceptedAt) + order.prepMinutes * 60_000).toISOString();
}

/**
 * Work order within each section: waiting orders by accept deadline (most urgent on top),
 * preparing by promised ready time, ready by how long they have waited, history newest first.
 */
const sorters: Record<BoardGroup, (a: Order, b: Order) => number> = {
  new: (a, b) => time(a.acceptBy ?? a.placedAt) - time(b.acceptBy ?? b.placedAt),
  preparing: (a, b) => time(readyByIso(a)) - time(readyByIso(b)),
  ready: (a, b) => time(a.readyAt) - time(b.readyAt),
  completed: (a, b) => time(b.placedAt) - time(a.placedAt),
  cancelled: (a, b) => time(b.placedAt) - time(a.placedAt),
};

export function groupOrders(orders: Order[]): Record<BoardGroup, Order[]> {
  const groups: Record<BoardGroup, Order[]> = { new: [], preparing: [], ready: [], completed: [], cancelled: [] };
  for (const order of orders) {
    const group = boardGroupOf(order.status);
    if (group) groups[group].push(order);
  }
  for (const { key } of BOARD_GROUPS) groups[key].sort(sorters[key]);
  return groups;
}

/** The actions the restaurant can take on an order right now, from the state machine. */
export type RestaurantOrderAction = 'accept' | 'reject' | 'markReady';

export function restaurantActionsFor(status: OrderStatus): RestaurantOrderAction[] {
  const next = allowedTransitions(status, 'restaurant');
  const actions: RestaurantOrderAction[] = [];
  if (next.includes('preparing')) actions.push('accept');
  if (next.includes('ready_for_pickup')) actions.push('markReady');
  if (next.includes('cancelled')) actions.push('reject');
  return actions;
}

export function itemCount(order: Pick<Order, 'items'>): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

/** Replaces (or adds) one order in a list, keeping the rest. */
export function upsertOrder(orders: Order[], order: Order): Order[] {
  const index = orders.findIndex((o) => o.id === order.id);
  if (index === -1) return [order, ...orders];
  const next = [...orders];
  next[index] = order;
  return next;
}

/** Prep-time choices offered when accepting (the API allows 5–90 minutes). */
export const PREP_MINUTES_OPTIONS = [10, 15, 20, 25, 30, 40, 45, 60] as const;

/** The branch's usual prep time when it is one of the choices; otherwise 20 minutes. */
export function defaultPrepMinutes(avgPrepMinutes: number | undefined): number {
  return PREP_MINUTES_OPTIONS.find((m) => m === avgPrepMinutes) ?? 20;
}
