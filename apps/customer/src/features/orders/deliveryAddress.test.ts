import type { OrderSummary } from '@hungerly/types';
import { money } from '@hungerly/utils';

import { workAddress } from '@/mock';

import { orderDeliveryDisplay } from './deliveryAddress';

const { id: _id, ...snapshot } = workAddress;

const order = (overrides: Partial<OrderSummary> = {}): OrderSummary => ({
  id: 'ord-1',
  orderNumber: 'SW1001',
  restaurantId: 'r-1',
  restaurantName: 'Test Kitchen',
  status: 'placed',
  lines: [{ name: 'Paneer tikka', quantity: 1, lineTotal: money(20000) }],
  total: money(20000),
  placedAt: '2026-11-10T12:00:00.000Z',
  ...overrides,
});

describe('orderDeliveryDisplay', () => {
  it('shows the label and address lines of the order snapshot', () => {
    expect(orderDeliveryDisplay(order({ deliveryAddress: snapshot }))).toEqual({
      title: 'Work',
      icon: 'briefcase-outline',
      lines: [
        'Office 7B, Panchshil Tech Park',
        'Yerwada',
        'Opposite Don Bosco School',
        'Yerawada, Pune 411006',
      ],
      accessibilityLabel:
        'Delivering to Work: Office 7B, Panchshil Tech Park, Yerwada, Opposite Don Bosco School, Yerawada, Pune 411006',
    });
  });

  it('skips optional parts the address does not have', () => {
    const { line2: _l, landmark: _m, ...minimal } = snapshot;
    expect(orderDeliveryDisplay(order({ deliveryAddress: minimal }))?.lines).toEqual([
      'Office 7B, Panchshil Tech Park',
      'Yerawada, Pune 411006',
    ]);
  });

  it('returns null for orders placed without an address (backward compatible)', () => {
    expect(orderDeliveryDisplay(order())).toBeNull();
    expect(orderDeliveryDisplay(order({ deliveryAddress: undefined }))).toBeNull();
  });
});
