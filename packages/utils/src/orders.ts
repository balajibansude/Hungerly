import type { Money, OrderActor, OrderBill, OrderStatus } from '@hungerly/types';

import { addMoney, money, multiplyMoney, subtractMoney, sumMoney } from './money';

/**
 * The order state machine from BLUEPRINT §25: for each status, the statuses it may move
 * to and which actors may make that move. The server is the authority (invalid moves
 * return `409 order.invalid_transition`); clients use this to decide which actions to
 * offer, and mocks use it to behave like the server.
 */
const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, readonly OrderActor[]>>> = {
  pending_payment: {
    placed: ['system'],
    cancelled: ['system', 'customer'],
  },
  placed: {
    preparing: ['restaurant'],
    cancelled: ['restaurant', 'customer', 'system', 'admin'],
  },
  preparing: {
    ready_for_pickup: ['restaurant'],
    // Rider picked up before the kitchen marked it ready (flagged for ops).
    picked_up: ['delivery_partner'],
    cancelled: ['admin'],
  },
  ready_for_pickup: {
    picked_up: ['delivery_partner'],
    cancelled: ['admin'],
  },
  picked_up: {
    delivered: ['delivery_partner'],
    cancelled: ['admin'],
  },
  delivered: {},
  cancelled: {},
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

/** Statuses `actor` may move an order to from `from`, in state-machine order. */
export function allowedTransitions(from: OrderStatus, actor: OrderActor): OrderStatus[] {
  return (Object.keys(TRANSITIONS[from]) as OrderStatus[]).filter((to) =>
    canTransition(from, to, actor),
  );
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return Object.keys(TRANSITIONS[status]).length === 0;
}

/** Statuses a restaurant still has work (or a handover) to do for. */
export const ACTIVE_KITCHEN_STATUSES: readonly OrderStatus[] = [
  'placed',
  'preparing',
  'ready_for_pickup',
];

/** Accept-time prep estimate bounds (API_BLUEPRINT §4.16). */
export const PREP_MINUTES_RANGE = { min: 5, max: 90 } as const;

export function isValidPrepMinutes(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= PREP_MINUTES_RANGE.min &&
    minutes <= PREP_MINUTES_RANGE.max
  );
}

/** `order_items.line_total_minor = (unit_price_minor + options_price_minor) × quantity`. */
export function orderLineTotal(unitPrice: Money, optionsPrice: Money, quantity: number): Money {
  return multiplyMoney(addMoney(unitPrice, optionsPrice), quantity);
}

/**
 * The bill total, using the same formula as the `orders` CHECK constraint:
 * subtotal + packaging + delivery + platform + tax + tip − discount.
 */
export function orderBillTotal(bill: Omit<OrderBill, 'total'>): Money {
  const charges = sumMoney(
    [bill.subtotal, bill.packagingFee, bill.deliveryFee, bill.platformFee, bill.tax, bill.tip],
    bill.subtotal.currency,
  );
  return subtractMoney(charges, bill.discount);
}

/** True if the stored total matches the formula and no amount is negative. */
export function isBillConsistent(bill: OrderBill): boolean {
  const amounts = Object.values(bill) as Money[];
  if (amounts.some((m) => m.amountMinor < 0)) return false;
  return orderBillTotal(bill).amountMinor === bill.total.amountMinor;
}

/** Builds a bill whose total always satisfies the invariant. Missing charges are zero. */
export function makeOrderBill(
  parts: Pick<OrderBill, 'subtotal'> & Partial<Omit<OrderBill, 'subtotal' | 'total'>>,
): OrderBill {
  const zero = money(0, parts.subtotal.currency);
  const bill = {
    subtotal: parts.subtotal,
    packagingFee: parts.packagingFee ?? zero,
    deliveryFee: parts.deliveryFee ?? zero,
    platformFee: parts.platformFee ?? zero,
    tax: parts.tax ?? zero,
    tip: parts.tip ?? zero,
    discount: parts.discount ?? zero,
  };
  return { ...bill, total: orderBillTotal(bill) };
}
