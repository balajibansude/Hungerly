import type { OrderStatus } from '@hungerly/types';

import { money } from './money';
import {
  allowedTransitions,
  canTransition,
  isBillConsistent,
  isTerminalOrderStatus,
  isValidPrepMinutes,
  makeOrderBill,
  orderBillTotal,
  orderLineTotal,
} from './orders';

describe('order state machine', () => {
  it('lets the restaurant accept, reject and mark ready — nothing else', () => {
    expect(allowedTransitions('placed', 'restaurant')).toEqual(['preparing', 'cancelled']);
    expect(allowedTransitions('preparing', 'restaurant')).toEqual(['ready_for_pickup']);
    expect(allowedTransitions('ready_for_pickup', 'restaurant')).toEqual([]);
    expect(allowedTransitions('picked_up', 'restaurant')).toEqual([]);
  });

  it('has no separate "accepted" status: accepting moves placed → preparing', () => {
    expect(canTransition('placed', 'preparing', 'restaurant')).toBe(true);
    expect(canTransition('placed', 'ready_for_pickup', 'restaurant')).toBe(false);
  });

  it('leaves pickup and delivery to the rider', () => {
    expect(canTransition('ready_for_pickup', 'picked_up', 'restaurant')).toBe(false);
    expect(canTransition('ready_for_pickup', 'picked_up', 'delivery_partner')).toBe(true);
    expect(canTransition('preparing', 'picked_up', 'delivery_partner')).toBe(true);
    expect(canTransition('picked_up', 'delivered', 'delivery_partner')).toBe(true);
  });

  it('allows the restaurant to cancel only before accepting', () => {
    expect(canTransition('placed', 'cancelled', 'restaurant')).toBe(true);
    expect(canTransition('preparing', 'cancelled', 'restaurant')).toBe(false);
    expect(canTransition('preparing', 'cancelled', 'admin')).toBe(true);
  });

  it('never moves backwards or out of a terminal status', () => {
    expect(canTransition('preparing', 'placed', 'restaurant')).toBe(false);
    expect(canTransition('ready_for_pickup', 'preparing', 'admin')).toBe(false);
    const terminal: OrderStatus[] = ['delivered', 'cancelled'];
    for (const status of terminal) {
      expect(isTerminalOrderStatus(status)).toBe(true);
      expect(allowedTransitions(status, 'admin')).toEqual([]);
    }
    expect(isTerminalOrderStatus('ready_for_pickup')).toBe(false);
  });

  it('bounds the prep-time estimate to 5–90 whole minutes', () => {
    expect(isValidPrepMinutes(5)).toBe(true);
    expect(isValidPrepMinutes(90)).toBe(true);
    expect(isValidPrepMinutes(4)).toBe(false);
    expect(isValidPrepMinutes(91)).toBe(false);
    expect(isValidPrepMinutes(12.5)).toBe(false);
  });
});

describe('order amounts', () => {
  it('computes line totals including options per unit', () => {
    expect(orderLineTotal(money(24900), money(4000), 3)).toEqual(money(86700));
  });

  it('totals the bill with the database formula', () => {
    const bill = {
      subtotal: money(64800),
      packagingFee: money(2000),
      deliveryFee: money(3500),
      platformFee: money(500),
      tax: money(3240),
      tip: money(2000),
      discount: money(10000),
    };
    expect(orderBillTotal(bill)).toEqual(money(66040));
  });

  it('builds consistent bills, defaulting missing charges to zero', () => {
    const bill = makeOrderBill({ subtotal: money(45000), tax: money(2250) });
    expect(bill.total).toEqual(money(47250));
    expect(bill.discount).toEqual(money(0));
    expect(isBillConsistent(bill)).toBe(true);
  });

  it('detects tampered totals and negative amounts', () => {
    const bill = makeOrderBill({ subtotal: money(45000) });
    expect(isBillConsistent({ ...bill, total: money(44000) })).toBe(false);
    expect(isBillConsistent({ ...bill, discount: money(-100), total: money(45100) })).toBe(false);
  });
});
