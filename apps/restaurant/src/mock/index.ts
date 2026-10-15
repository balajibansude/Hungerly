import type { Money, Order } from '@hungerly/api-client';

// Stable demo UUIDs — all IDs that pass through Zod's z.uuid() validator must use these.

/** Branch ID for the Masala Junction prototype restaurant. */
export const MASALA_JUNCTION_ID = 'de000000-de00-de00-de00-de0000000001';

/** ID of the placed order used in operations tests (was HGR-4K7P2M). */
export const DEMO_ORDER_NEW = 'de000000-de00-de00-de01-de0000000002';

/** ID of the preparing order used in operations tests (was HGR-7R1C9W). */
export const DEMO_ORDER_PREPARING = 'de000000-de00-de00-de01-de0000000005';

// ---------------------------------------------------------------------------

const INR = (minor: number): Money => ({ amountMinor: minor, currency: 'INR' });
const ZERO = INR(0);

/** Produces seed orders for Masala Junction. NOW controls acceptBy and timing fields. */
export function masalaJunctionOrders(now: Date = new Date()): Order[] {
  // NOW as UTC milliseconds: tests use 2026-10-02T07:30:00Z (13:00 IST)
  const t = now.getTime();
  const ago = (ms: number) => new Date(t - ms).toISOString();
  const min = 60_000;

  // Item UUIDs are sequential per call — tests never inspect item IDs directly.
  let itemSeq = 0;
  const nextItemId = () =>
    `de000000-de00-de00-de11-${String(++itemSeq).padStart(12, '0')}`;

  const item = (
    name: string,
    qty: number,
    priceMinor: number,
    foodType: Order['items'][0]['foodType'] = 'veg',
  ): Order['items'][0] => ({
    id: nextItemId(),
    menuItemId: null,
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
    items: [item('Dal Makhani', 1, 28000)],
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
    ...baseOrder('de000000-de00-de00-de01-de0000000001', 'HGR-9X3D5Q', 'placed', 'cod', 'pending', ago(6 * min)),
    items: [item('Chicken Biryani', 1, 24000, 'non_veg')],
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

  // HGR-4K7P2M: placed 5 min ago, paid online — DEMO_ORDER_NEW in operations tests; 3 items qty 5
  const ord4k7p2m: Order = {
    ...baseOrder(DEMO_ORDER_NEW, 'HGR-4K7P2M', 'placed', 'online', 'paid', ago(5 * min)),
    items: [
      item('Dal Makhani', 2, 25000),
      item('Butter Naan', 2, 5000),
      item('Raita', 1, 6000),
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
    ...baseOrder('de000000-de00-de00-de01-de0000000003', 'HGR-2M8V6T', 'placed', 'online', 'pending', ago(3 * min)),
  };

  // --- Preparing (2 orders) ---
  // HGR-5T6Y2B: overdue 10 min (acceptedAt=30 min ago, prepMinutes=20, readyBy=10 min ago)
  const ord5t6y2b: Order = {
    ...baseOrder('de000000-de00-de00-de01-de0000000004', 'HGR-5T6Y2B', 'preparing', 'online', 'paid', ago(35 * min)),
    prepMinutes: 20,
    acceptedAt: ago(30 * min),
    timeline: [
      { status: 'placed', at: ago(35 * min), actor: 'customer', note: null },
      { status: 'preparing', at: ago(30 * min), actor: 'restaurant', note: null },
    ],
  };

  // HGR-7R1C9W: ready in 9 min (readyBy = now + 9 min = 07:39Z = 13:09 IST) — DEMO_ORDER_PREPARING
  const ord7r1c9w: Order = {
    ...baseOrder(DEMO_ORDER_PREPARING, 'HGR-7R1C9W', 'preparing', 'cod', 'not_applicable', ago(15 * min)),
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
    ...baseOrder('de000000-de00-de00-de01-de0000000006', 'HGR-3H9N4K', 'ready_for_pickup', 'online', 'paid', ago(25 * min)),
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
    ...baseOrder('de000000-de00-de00-de01-de0000000007', 'HGR-6Q4W1Z', 'delivered', 'online', 'paid', ago(120 * min)),
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
    ...baseOrder('de000000-de00-de00-de01-de0000000008', 'HGR-1A2B3C', 'picked_up', 'cod', 'not_applicable', ago(90 * min)),
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
    ...baseOrder('de000000-de00-de00-de01-de0000000009', 'HGR-8D9E0F', 'delivered', 'online', 'paid', ago(180 * min)),
    prepMinutes: 30,
    acceptedAt: ago(175 * min),
    readyAt: ago(145 * min),
    deliveredAt: ago(120 * min),
    timeline: [],
  };

  // --- Cancelled (2 orders, newest placedAt first) ---
  // HGR-4B7G3E: rejected by restaurant (item_out_of_stock), refunded — placed more recently
  const ord4b7g3e: Order = {
    ...baseOrder('de000000-de00-de00-de01-de000000000a', 'HGR-4B7G3E', 'cancelled', 'online', 'refunded', ago(60 * min)),
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
    ...baseOrder('de000000-de00-de00-de01-de000000000b', 'HGR-9E2U6H', 'cancelled', 'cod', 'not_applicable', ago(90 * min)),
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
