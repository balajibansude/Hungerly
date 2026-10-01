import type { OrderStatus, PartnerOrder } from '@hungerly/types';
import { allowedTransitions } from '@hungerly/utils';

/**
 * The order board's sections. They group the database statuses (no second state model):
 * the kitchen sees picked-up and delivered orders as one "Completed" pile, and orders
 * still awaiting online payment are not shown to the restaurant at all.
 */
export type BoardGroup = 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export const BOARD_GROUPS: { key: BoardGroup; label: string; statuses: OrderStatus[] }[] = [
  { key: 'new', label: 'New', statuses: ['placed'] },
  { key: 'preparing', label: 'Preparing', statuses: ['preparing'] },
  { key: 'ready', label: 'Ready for pickup', statuses: ['ready_for_pickup'] },
  { key: 'completed', label: 'Completed', statuses: ['picked_up', 'delivered'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
];

export function boardGroupOf(status: OrderStatus): BoardGroup | null {
  return BOARD_GROUPS.find((group) => group.statuses.includes(status))?.key ?? null;
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);

/**
 * Work order within each section: waiting orders oldest first (most urgent on top),
 * preparing by promised ready time, history newest first.
 */
const sorters: Record<BoardGroup, (a: PartnerOrder, b: PartnerOrder) => number> = {
  new: (a, b) => time(a.placedAt) - time(b.placedAt),
  preparing: (a, b) => time(a.estimatedReadyAt) - time(b.estimatedReadyAt),
  ready: (a, b) => time(a.readyAt) - time(b.readyAt),
  completed: (a, b) => time(b.placedAt) - time(a.placedAt),
  cancelled: (a, b) => time(b.placedAt) - time(a.placedAt),
};

export function groupOrders(orders: PartnerOrder[]): Record<BoardGroup, PartnerOrder[]> {
  const groups: Record<BoardGroup, PartnerOrder[]> = {
    new: [],
    preparing: [],
    ready: [],
    completed: [],
    cancelled: [],
  };
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

export function itemCount(order: Pick<PartnerOrder, 'items'>): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}
