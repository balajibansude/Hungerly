import type { OrderStatus } from '@hungerly/types';

import { masalaJunctionOrders } from '@/mock';

import { BOARD_GROUPS, boardGroupOf, groupOrders, itemCount, restaurantActionsFor } from './board';

const NOW = new Date('2026-10-02T13:00:00+05:30');

describe('board groups', () => {
  it('maps every database status to one section, hiding unpaid orders', () => {
    const expected: Record<OrderStatus, string | null> = {
      pending_payment: null,
      placed: 'new',
      preparing: 'preparing',
      ready_for_pickup: 'ready',
      picked_up: 'completed',
      delivered: 'completed',
      cancelled: 'cancelled',
    };
    for (const [status, group] of Object.entries(expected)) {
      expect(boardGroupOf(status as OrderStatus)).toBe(group);
    }
    expect(BOARD_GROUPS.map((g) => g.label)).toEqual([
      'New',
      'Preparing',
      'Ready for pickup',
      'Completed',
      'Cancelled',
    ]);
  });

  it('groups the demo orders with urgent work first', () => {
    const groups = groupOrders(masalaJunctionOrders(NOW));
    expect(groups.new.map((o) => o.orderNumber)).toEqual([
      'HGR-9X3D5Q',
      'HGR-4K7P2M',
      'HGR-2M8V6T',
    ]);
    // Preparing: the one due soonest (already overdue) first.
    expect(groups.preparing.map((o) => o.orderNumber)).toEqual(['HGR-5T6Y2B', 'HGR-7R1C9W']);
    expect(groups.ready).toHaveLength(1);
    expect(groups.completed).toHaveLength(3);
    // History: newest first.
    expect(groups.cancelled.map((o) => o.orderNumber)).toEqual(['HGR-4B7G3E', 'HGR-9E2U6H']);
  });

  it('keeps every order exactly once', () => {
    const orders = masalaJunctionOrders(NOW);
    const groups = groupOrders(orders);
    const total = Object.values(groups).reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(orders.length);
  });
});

describe('restaurant actions', () => {
  it('follows the state machine for the restaurant', () => {
    expect(restaurantActionsFor('placed')).toEqual(['accept', 'reject']);
    expect(restaurantActionsFor('preparing')).toEqual(['markReady']);
    for (const status of ['ready_for_pickup', 'picked_up', 'delivered', 'cancelled'] as const) {
      expect(restaurantActionsFor(status)).toEqual([]);
    }
  });
});

describe('itemCount', () => {
  it('counts quantities, not lines', () => {
    const order = masalaJunctionOrders(NOW).find((o) => o.orderNumber === 'HGR-4K7P2M');
    expect(order?.items).toHaveLength(3);
    expect(order && itemCount(order)).toBe(5);
  });
});
