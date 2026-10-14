import type { Order } from '@hungerly/api-client';

const inr = (amountMinor: number) => ({ amountMinor, currency: 'INR' as const });
let seq = 0;

/** Builds an API `Order` for tests. Times are ISO strings in UTC. */
export function makeOrder(overrides: Partial<Order> = {}): Order {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  return {
    id,
    orderNumber: `HGR-T${String(seq).padStart(5, '0')}`,
    branchId: '00000000-0000-4000-8000-0000000000b1',
    status: 'placed',
    paymentMethod: 'online',
    paymentStatus: 'paid',
    customer: { firstName: 'Priya', phoneMasked: '+91 ******3210' },
    delivery: { locality: 'Indiranagar', distanceMeters: 2400, rider: null },
    instructions: null,
    items: [
      {
        id: `${id}-1`,
        menuItemId: null,
        name: 'Paneer Tikka',
        foodType: 'veg',
        quantity: 2,
        unitPrice: inr(25_000),
        lineTotal: inr(50_000),
        options: [],
        notes: null,
      },
    ],
    bill: {
      subtotal: inr(50_000),
      packagingFee: inr(2_000),
      deliveryFee: inr(3_000),
      platformFee: inr(500),
      tax: inr(2_500),
      tip: inr(0),
      discount: inr(0),
      restaurantFundedDiscount: inr(0),
      total: inr(58_000),
    },
    prepMinutes: null,
    placedAt: '2026-10-12T07:00:00.000Z',
    acceptBy: '2026-10-12T07:03:00.000Z',
    acceptedAt: null,
    readyAt: null,
    deliveredAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    timeline: [{ status: 'placed', at: '2026-10-12T07:00:00.000Z', actor: 'customer', note: null }],
    version: 1,
    isDevFixture: false,
    ...overrides,
  };
}
