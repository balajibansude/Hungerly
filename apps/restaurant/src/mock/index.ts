import type { Money, Order } from '@hungerly/api-client';

export const MASALA_JUNCTION_ID = 'branch-masala-junction';

const INR = (minor: number): Money => ({ amountMinor: minor, currency: 'INR' });
const ZERO = INR(0);

/** Produces seed orders for Masala Junction. NOW controls acceptBy and timing fields. */
export function masalaJunctionOrders(now: Date = new Date()): Order[] {
  // NOW as UTC milliseconds: tests use 2026-10-02T07:30:00Z (13:00 IST)
  const t = now.getTime();
  const ago = (ms: number) => new Date(t - ms).toISOString();
  const min = 60_000;

  const item = (
    id: string,
    name: string,
    qty: number,
    priceMinor: number,
    foodType: Order['items'][0]['foodType'] = 'veg',
  ): Order['items'][0] => ({
    id,
    menuItemId: `mi-${id}`,
    name,
    foodType,
    quantity: qty,
    unitPrice: INR(priceMinor),
    lineTotal: INR(priceMinor * qty),
    options: [],
    notes: null,
  });

  const baseOrder = (
    id: string,
    orderNumber: string,
    status: Order['status'],
    paymentMethod: Order['paymentMethod'],
    paymentStatus: Order['paymentStatus'],
    placedAt: string,
  ): Order => ({
    id,
    orderNumber,
    branchId: MASALA_JUNCTION_ID,
    status,
    paymentMethod,
    paymentStatus,
    customer: { firstName: 'Customer', phoneMasked: '98XXXXX789' },
    delivery: { locality: 'Koregaon Park', distanceMeters: 1200, rider: null },
    instructions: null,
    items: [item(`${id}-i1`, 'Dal Makhani', 1, 28000)],
    bill: {
      subtotal: INR(28000),
      packagingFee: INR(1000),
      deliveryFee: INR(2500),
      platformFee: ZERO,
      tax: INR(1500),
      tip: ZERO,
      discount: ZERO,
      restaurantFundedDiscount: ZERO,
      total: INR(33000),
    },
    prepMinutes: null,
    placedAt,
    acceptBy: null,
    acceptedAt: null,
    readyAt: null,
    deliveredAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    timeline: [],
    version: 1,
    isDevFixture: true,
  });

  // --- New (placed, 3 orders) ---
  // HGR-9X3D5Q: placed 6 min ago, COD pending — most urgent (earliest placedAt)
  const ord9x3d5q: Order = {
    ...baseOrder('ord-9x3d5q', 'HGR-9X3D5Q', 'placed', 'cod', 'pending', ago(6 * min)),
    items: [item('9x3d5q-i1', 'Chicken Biryani', 1, 24000, 'non_veg')],
    bill: {
      subtotal: INR(24000),
      packagingFee: INR(1000),
      deliveryFee: INR(2500),
      platformFee: ZERO,
      tax: INR(1250),
      tip: ZERO,
      discount: ZERO,
      restaurantFundedDiscount: ZERO,
      total: INR(28750),
    },
  };

  // HGR-4K7P2M: placed 5 min ago, paid online — NEW_ORDER in operations tests; 3 items qty 5
  const ord4k7p2m: Order = {
    ...baseOrder('ord-4k7p2m', 'HGR-4K7P2M', 'placed', 'online', 'paid', ago(5 * min)),
    items: [
      item('4k7p2m-i1', 'Dal Makhani', 2, 25000),
      item('4k7p2m-i2', 'Butter Naan', 2, 5000),
      item('4k7p2m-i3', 'Raita', 1, 6000),
    ],
    bill: {
      subtotal: INR(66000),
      packagingFee: INR(1000),
      deliveryFee: INR(2500),
      platformFee: ZERO,
      tax: INR(3375),
      tip: ZERO,
      discount: ZERO,
      restaurantFundedDiscount: ZERO,
      total: INR(72875),
    },
  };

  // HGR-2M8V6T: placed 3 min ago — least urgent
  const ord2m8v6t: Order = {
    ...baseOrder('ord-2m8v6t', 'HGR-2M8V6T', 'placed', 'online', 'pending', ago(3 * min)),
  };

  // --- Preparing (2 orders) ---
  // HGR-5T6Y2B: overdue 10 min (acceptedAt=30 min ago, prepMinutes=20, readyBy=10 min ago)
  const ord5t6y2b: Order = {
    ...baseOrder('ord-5t6y2b', 'HGR-5T6Y2B', 'preparing', 'online', 'paid', ago(35 * min)),
    prepMinutes: 20,
    acceptedAt: ago(30 * min),
    timeline: [
      { status: 'placed', at: ago(35 * min), actor: 'customer', note: null },
      { status: 'preparing', at: ago(30 * min), actor: 'restaurant', note: null },
    ],
  };

  // HGR-7R1C9W: ready in 9 min (readyBy = now + 9 min = 07:39Z = 13:09 IST)
  const ord7r1c9w: Order = {
    ...baseOrder('ord-7r1c9w', 'HGR-7R1C9W', 'preparing', 'cod', 'not_applicable', ago(15 * min)),
    prepMinutes: 20,
    acceptedAt: ago(11 * min),
    timeline: [
      { status: 'placed', at: ago(15 * min), actor: 'customer', note: null },
      { status: 'preparing', at: ago(11 * min), actor: 'restaurant', note: null },
    ],
  };

  // --- Ready (1 order) ---
  // HGR-3H9N4K: readyAt = 12 min ago = 12:48 IST = ago(12 min)
  const ord3h9n4k: Order = {
    ...baseOrder('ord-3h9n4k', 'HGR-3H9N4K', 'ready_for_pickup', 'online', 'paid', ago(25 * min)),
    status: 'ready_for_pickup',
    prepMinutes: 15,
    acceptedAt: ago(20 * min),
    readyAt: ago(12 * min),
    delivery: { locality: 'Kalyani Nagar', distanceMeters: 2100, rider: { firstName: 'Arjun' } },
    timeline: [
      { status: 'placed', at: ago(25 * min), actor: 'customer', note: null },
      { status: 'preparing', at: ago(20 * min), actor: 'restaurant', note: null },
      { status: 'ready_for_pickup', at: ago(12 * min), actor: 'restaurant', note: null },
    ],
  };

  // --- Completed (3 orders) ---
  // HGR-6Q4W1Z: delivered — kitchenTiming returns null
  const ord6q4w1z: Order = {
    ...baseOrder('ord-6q4w1z', 'HGR-6Q4W1Z', 'delivered', 'online', 'paid', ago(120 * min)),
    prepMinutes: 25,
    acceptedAt: ago(115 * min),
    readyAt: ago(90 * min),
    deliveredAt: ago(60 * min),
    timeline: [
      { status: 'placed', at: ago(120 * min), actor: 'customer', note: null },
      { status: 'preparing', at: ago(115 * min), actor: 'restaurant', note: null },
      { status: 'ready_for_pickup', at: ago(90 * min), actor: 'restaurant', note: null },
      { status: 'picked_up', at: ago(75 * min), actor: 'delivery_partner', note: null },
      { status: 'delivered', at: ago(60 * min), actor: 'delivery_partner', note: null },
    ],
  };

  const ord1a2b3c: Order = {
    ...baseOrder('ord-1a2b3c', 'HGR-1A2B3C', 'picked_up', 'cod', 'not_applicable', ago(90 * min)),
    prepMinutes: 20,
    acceptedAt: ago(85 * min),
    readyAt: ago(65 * min),
    timeline: [
      { status: 'placed', at: ago(90 * min), actor: 'customer', note: null },
      { status: 'preparing', at: ago(85 * min), actor: 'restaurant', note: null },
      { status: 'ready_for_pickup', at: ago(65 * min), actor: 'restaurant', note: null },
      { status: 'picked_up', at: ago(50 * min), actor: 'delivery_partner', note: null },
    ],
  };

  const ord8d9e0f: Order = {
    ...baseOrder('ord-8d9e0f', 'HGR-8D9E0F', 'delivered', 'online', 'paid', ago(180 * min)),
    prepMinutes: 30,
    acceptedAt: ago(175 * min),
    readyAt: ago(145 * min),
    deliveredAt: ago(120 * min),
    timeline: [],
  };

  // --- Cancelled (2 orders, newest placedAt first) ---
  // HGR-4B7G3E: rejected by restaurant (item_out_of_stock), refunded — placed more recently
  const ord4b7g3e: Order = {
    ...baseOrder('ord-4b7g3e', 'HGR-4B7G3E', 'cancelled', 'online', 'refunded', ago(60 * min)),
    cancelledBy: 'restaurant',
    cancelReason: 'item_out_of_stock',
    cancelledAt: ago(55 * min),
    timeline: [
      { status: 'placed', at: ago(60 * min), actor: 'customer', note: null },
      { status: 'cancelled', at: ago(55 * min), actor: 'restaurant', note: null },
    ],
  };

  // HGR-9E2U6H: cancelled by customer — placed earlier
  const ord9e2u6h: Order = {
    ...baseOrder('ord-9e2u6h', 'HGR-9E2U6H', 'cancelled', 'cod', 'not_applicable', ago(90 * min)),
    cancelledBy: 'customer',
    cancelledAt: ago(85 * min),
    timeline: [
      { status: 'placed', at: ago(90 * min), actor: 'customer', note: null },
      { status: 'cancelled', at: ago(85 * min), actor: 'customer', note: null },
    ],
  };

  return [
    ord9x3d5q,
    ord4k7p2m,
    ord2m8v6t,
    ord5t6y2b,
    ord7r1c9w,
    ord3h9n4k,
    ord6q4w1z,
    ord1a2b3c,
    ord8d9e0f,
    ord4b7g3e,
    ord9e2u6h,
  ];
}
