import { masalaJunctionOrders } from '@/mock';

import {
  cancellationLabel,
  formatAgo,
  formatClock,
  formatDateTime,
  kitchenTiming,
  paymentLabel,
} from './format';

const NOW = new Date('2026-10-02T13:00:00+05:30');
const byNumber = (n: string) => {
  const order = masalaJunctionOrders(NOW).find((o) => o.orderNumber === n);
  if (!order) throw new Error(`missing ${n}`);
  return order;
};

describe('clock formatting', () => {
  it('shows restaurant (IST) time regardless of the device timezone', () => {
    expect(formatClock('2026-10-02T07:35:00Z')).toBe('1:05 pm');
    expect(formatDateTime('2026-10-02T07:35:00Z')).toBe('Fri, 2 Oct, 1:05 pm');
    // 20:00 UTC on Saturday is already 01:30 on Sunday in India.
    expect(formatDateTime('2026-10-03T20:00:00Z')).toBe('Sun, 4 Oct, 1:30 am');
  });

  it('describes elapsed time', () => {
    expect(formatAgo(NOW.toISOString(), NOW)).toBe('just now');
    expect(formatAgo(new Date(NOW.getTime() - 8 * 60_000).toISOString(), NOW)).toBe('8 min ago');
    expect(formatAgo(new Date(NOW.getTime() - 125 * 60_000).toISOString(), NOW)).toBe(
      '2 h 5 min ago',
    );
  });
});

describe('kitchen timing', () => {
  it('shows how long a new order has waited', () => {
    expect(kitchenTiming(byNumber('HGR-9X3D5Q'), NOW)).toEqual({
      label: 'Waiting 6 min',
      tone: 'info',
    });
  });

  it('counts down preparing orders and flags overdue ones', () => {
    expect(kitchenTiming(byNumber('HGR-7R1C9W'), NOW)).toEqual({
      label: 'Ready in 9 min · by 1:09 pm',
      tone: 'warning',
    });
    expect(kitchenTiming(byNumber('HGR-5T6Y2B'), NOW)).toEqual({
      label: 'Overdue 10 min',
      tone: 'error',
    });
  });

  it('shows when a ready order became ready, and nothing for history', () => {
    expect(kitchenTiming(byNumber('HGR-3H9N4K'), NOW)).toEqual({
      label: 'Ready since 12:48 pm',
      tone: 'success',
    });
    expect(kitchenTiming(byNumber('HGR-6Q4W1Z'), NOW)).toBeNull();
  });
});

describe('labels', () => {
  it('explains who cancelled and why', () => {
    expect(cancellationLabel(byNumber('HGR-4B7G3E'))).toBe('Rejected: item out of stock');
    expect(cancellationLabel(byNumber('HGR-9E2U6H'))).toBe('Cancelled by the customer');
  });

  it('describes payment', () => {
    expect(paymentLabel(byNumber('HGR-4K7P2M'))).toBe('Paid online');
    expect(paymentLabel(byNumber('HGR-9X3D5Q'))).toBe('Cash on delivery · payment pending');
    expect(paymentLabel(byNumber('HGR-4B7G3E'))).toBe('Paid online · refunded');
  });
});
