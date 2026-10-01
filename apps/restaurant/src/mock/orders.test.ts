import { boardGroupOf } from '@/features/orders/board';
import { isBillConsistent, orderLineTotal, sumMoney } from '@hungerly/utils';

import { masalaJunctionOrders } from './orders';
import { MASALA_JUNCTION_ID } from './restaurant';

const NOW = new Date('2026-10-02T13:00:00+05:30');

describe('Masala Junction mock orders', () => {
  const orders = masalaJunctionOrders(NOW);

  it('covers every board section', () => {
    const groups = new Set(orders.map((o) => boardGroupOf(o.status)));
    expect([...groups].sort()).toEqual(['cancelled', 'completed', 'new', 'preparing', 'ready']);
    expect(orders.filter((o) => o.status === 'placed').length).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic for a given clock', () => {
    expect(masalaJunctionOrders(NOW)).toEqual(orders);
  });

  it('has unique ids and order numbers, all at the demo restaurant', () => {
    expect(new Set(orders.map((o) => o.id)).size).toBe(orders.length);
    expect(new Set(orders.map((o) => o.orderNumber)).size).toBe(orders.length);
    expect(orders.every((o) => o.restaurantId === MASALA_JUNCTION_ID)).toBe(true);
    expect(orders.every((o) => /^HGR-[0-9A-Z]{6}$/.test(o.orderNumber))).toBe(true);
  });

  it('has bills that add up, line by line and in total', () => {
    for (const order of orders) {
      for (const item of order.items) {
        expect(item.lineTotal).toEqual(
          orderLineTotal(item.unitPrice, item.optionsPrice, item.quantity),
        );
      }
      expect(order.bill.subtotal).toEqual(sumMoney(order.items.map((i) => i.lineTotal)));
      expect(isBillConsistent(order.bill)).toBe(true);
    }
  });

  it('has a history that ends in the current status', () => {
    for (const order of orders) {
      expect(order.timeline[0]).toMatchObject({ fromStatus: null, toStatus: 'placed' });
      expect(order.timeline[order.timeline.length - 1]?.toStatus).toBe(order.status);
      expect(order.version).toBe(order.timeline.length);
    }
  });

  it('sets milestone times only for milestones reached', () => {
    for (const order of orders) {
      expect(order.acceptedAt !== null).toBe(
        order.timeline.some((e) => e.toStatus === 'preparing'),
      );
      expect(order.cancelledAt !== null).toBe(order.status === 'cancelled');
      expect(order.prepMinutes !== null).toBe(order.acceptedAt !== null);
      expect(Date.parse(order.placedAt)).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('masks customer phone numbers', () => {
    expect(orders.every((o) => /^\+91 \d{2}XXX XX\d{3}$/.test(o.customer.phoneMasked))).toBe(true);
  });
});
