import type {
  FoodType,
  Money,
  OrderActor,
  OrderItem,
  OrderItemOption,
  OrderStatus,
  OrderStatusEvent,
  PartnerOrder,
  PaymentMethod,
  PaymentStatus,
} from '@hungerly/types';
import { makeOrderBill, money, orderLineTotal, sumMoney } from '@hungerly/utils';

import { MASALA_JUNCTION_ID, masalaJunction } from './restaurant';

/**
 * PROTOTYPE DATA. Orders at Masala Junction covering every board group. Customers,
 * localities and amounts are invented; phone numbers are masked like the partner API.
 * Times are relative to `now`, so the board looks live while tests stay deterministic.
 * Imported only by src/services/mock.
 */

interface Dish {
  id: string;
  name: string;
  foodType: FoodType;
  price: Money;
}

const dish = (id: string, name: string, foodType: FoodType, rupees: number): Dish => ({
  id: `itm-${id}`,
  name,
  foodType,
  price: money(rupees * 100),
});

const dishes = {
  dalMakhani: dish('dal-makhani', 'Dal Makhani', 'veg', 289),
  paneerTikka: dish('paneer-tikka', 'Paneer Tikka', 'veg', 329),
  butterChicken: dish('butter-chicken', 'Butter Chicken', 'non_veg', 389),
  chickenBiryani: dish('chicken-biryani', 'Chicken Dum Biryani', 'non_veg', 349),
  vegBiryani: dish('veg-biryani', 'Veg Dum Biryani', 'veg', 279),
  muttonRoganJosh: dish('mutton-rogan-josh', 'Mutton Rogan Josh', 'non_veg', 449),
  eggCurry: dish('egg-curry', 'Egg Curry', 'egg', 249),
  butterNaan: dish('butter-naan', 'Butter Naan', 'veg', 69),
  garlicNaan: dish('garlic-naan', 'Garlic Naan', 'veg', 79),
  jeeraRice: dish('jeera-rice', 'Jeera Rice', 'veg', 189),
  gulabJamun: dish('gulab-jamun', 'Gulab Jamun (2 pcs)', 'veg', 119),
  sweetLassi: dish('sweet-lassi', 'Sweet Lassi', 'veg', 99),
};

const option = (groupName: string, optionName: string, rupees = 0): OrderItemOption => ({
  groupName,
  optionName,
  priceDelta: money(rupees * 100),
});

let lineCounter = 0;
function line(
  item: Dish,
  quantity: number,
  options: OrderItemOption[] = [],
  notes?: string,
): OrderItem {
  lineCounter += 1;
  const optionsPrice = sumMoney(options.map((o) => o.priceDelta));
  return {
    id: `oli-${lineCounter}`,
    menuItemId: item.id,
    name: item.name,
    foodType: item.foodType,
    unitPrice: item.price,
    optionsPrice,
    quantity,
    lineTotal: orderLineTotal(item.price, optionsPrice, quantity),
    options,
    ...(notes ? { notes } : {}),
  };
}

/** GST on restaurant food is 5% in the prototype; real tax rules are open (OD-04). */
const TAX_BPS = 500;
const PLATFORM_FEE = money(500);

function billFor(
  items: OrderItem[],
  extras: { deliveryRupees: number; discountRupees?: number; tipRupees?: number },
) {
  const subtotal = sumMoney(items.map((i) => i.lineTotal));
  return makeOrderBill({
    subtotal,
    packagingFee: masalaJunction.packagingFee,
    deliveryFee: money(extras.deliveryRupees * 100),
    platformFee: PLATFORM_FEE,
    tax: money(Math.round((subtotal.amountMinor * TAX_BPS) / 10_000)),
    tip: money((extras.tipRupees ?? 0) * 100),
    discount: money((extras.discountRupees ?? 0) * 100),
  });
}

interface OrderSeed {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customer: { firstName: string; phoneMasked: string };
  locality: string;
  distanceMeters: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  items: OrderItem[];
  extras: { deliveryRupees: number; discountRupees?: number; tipRupees?: number };
  specialInstructions?: string;
  /** Minutes before `now` for each milestone reached. */
  placed: number;
  accepted?: { at: number; prepMinutes: number };
  ready?: number;
  pickedUp?: number;
  delivered?: number;
  cancelled?: { at: number; by: OrderActor; reason: string };
  rider?: { name: string; phoneMasked: string };
}

const seeds = (): OrderSeed[] => [
  {
    id: 'ord-4k7p2m',
    orderNumber: 'HGR-4K7P2M',
    status: 'placed',
    customer: { firstName: 'Ananya', phoneMasked: '+91 98XXX XX214' },
    locality: 'Kalyani Nagar',
    distanceMeters: 2800,
    paymentMethod: 'online',
    paymentStatus: 'paid',
    items: [
      line(dishes.butterChicken, 1, [option('Spice level', 'Medium')]),
      line(dishes.butterNaan, 3),
      line(dishes.sweetLassi, 1, [], 'Less sugar please'),
    ],
    extras: { deliveryRupees: 35 },
    placed: 2,
  },
  {
    id: 'ord-9x3d5q',
    orderNumber: 'HGR-9X3D5Q',
    status: 'placed',
    customer: { firstName: 'Rahul', phoneMasked: '+91 97XXX XX508' },
    locality: 'Viman Nagar',
    distanceMeters: 4100,
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    items: [
      line(dishes.chickenBiryani, 2, [option('Portion', 'Full', 120)]),
      line(dishes.gulabJamun, 1),
    ],
    extras: { deliveryRupees: 45 },
    specialInstructions: 'Please don’t ring the bell — baby sleeping. Call on arrival.',
    placed: 6,
  },
  {
    id: 'ord-2m8v6t',
    orderNumber: 'HGR-2M8V6T',
    status: 'placed',
    customer: { firstName: 'Sneha', phoneMasked: '+91 99XXX XX731' },
    locality: 'Boat Club Road',
    distanceMeters: 1600,
    paymentMethod: 'online',
    paymentStatus: 'paid',
    items: [
      line(dishes.vegBiryani, 1),
      line(dishes.paneerTikka, 1, [option('Add-ons', 'Extra mint chutney', 20)]),
    ],
    extras: { deliveryRupees: 25 },
    placed: 1,
  },
  {
    id: 'ord-7r1c9w',
    orderNumber: 'HGR-7R1C9W',
    status: 'preparing',
    customer: { firstName: 'Karan', phoneMasked: '+91 90XXX XX165' },
    locality: 'Magarpatta',
    distanceMeters: 5200,
    paymentMethod: 'online',
    paymentStatus: 'paid',
    items: [line(dishes.muttonRoganJosh, 1), line(dishes.jeeraRice, 1), line(dishes.garlicNaan, 2)],
    extras: { deliveryRupees: 50, discountRupees: 75 },
    placed: 18,
    accepted: { at: 16, prepMinutes: 25 },
  },
  {
    id: 'ord-5t6y2b',
    orderNumber: 'HGR-5T6Y2B',
    status: 'preparing',
    customer: { firstName: 'Priya', phoneMasked: '+91 98XXX XX902' },
    locality: 'Koregaon Park',
    distanceMeters: 900,
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    items: [line(dishes.dalMakhani, 1), line(dishes.butterNaan, 2)],
    extras: { deliveryRupees: 20 },
    placed: 32,
    accepted: { at: 30, prepMinutes: 20 },
  },
  {
    id: 'ord-3h9n4k',
    orderNumber: 'HGR-3H9N4K',
    status: 'ready_for_pickup',
    customer: { firstName: 'Vikram', phoneMasked: '+91 96XXX XX377' },
    locality: 'Kalyani Nagar',
    distanceMeters: 2200,
    paymentMethod: 'online',
    paymentStatus: 'paid',
    items: [line(dishes.eggCurry, 1), line(dishes.jeeraRice, 1), line(dishes.sweetLassi, 2)],
    extras: { deliveryRupees: 30, tipRupees: 20 },
    placed: 41,
    accepted: { at: 39, prepMinutes: 20 },
    ready: 12,
  },
  {
    id: 'ord-8l2f7j',
    orderNumber: 'HGR-8L2F7J',
    status: 'picked_up',
    customer: { firstName: 'Meera', phoneMasked: '+91 93XXX XX640' },
    locality: 'Mundhwa',
    distanceMeters: 3400,
    paymentMethod: 'online',
    paymentStatus: 'paid',
    items: [line(dishes.paneerTikka, 1), line(dishes.garlicNaan, 2), line(dishes.dalMakhani, 1)],
    extras: { deliveryRupees: 35 },
    placed: 70,
    accepted: { at: 68, prepMinutes: 20 },
    ready: 47,
    pickedUp: 42,
    rider: { name: 'Sachin P.', phoneMasked: '+91 88XXX XX019' },
  },
  {
    id: 'ord-6q4w1z',
    orderNumber: 'HGR-6Q4W1Z',
    status: 'delivered',
    customer: { firstName: 'Arjun', phoneMasked: '+91 98XXX XX455' },
    locality: 'Viman Nagar',
    distanceMeters: 4300,
    paymentMethod: 'online',
    paymentStatus: 'paid',
    items: [line(dishes.butterChicken, 2), line(dishes.butterNaan, 4), line(dishes.gulabJamun, 2)],
    extras: { deliveryRupees: 45, discountRupees: 100, tipRupees: 30 },
    placed: 150,
    accepted: { at: 148, prepMinutes: 25 },
    ready: 124,
    pickedUp: 120,
    delivered: 98,
    rider: { name: 'Imran K.', phoneMasked: '+91 89XXX XX287' },
  },
  {
    id: 'ord-1d5s8x',
    orderNumber: 'HGR-1D5S8X',
    status: 'delivered',
    customer: { firstName: 'Fatima', phoneMasked: '+91 95XXX XX812' },
    locality: 'Wanowrie',
    distanceMeters: 4800,
    paymentMethod: 'cod',
    paymentStatus: 'paid',
    items: [line(dishes.chickenBiryani, 1), line(dishes.sweetLassi, 1)],
    extras: { deliveryRupees: 45 },
    placed: 190,
    accepted: { at: 188, prepMinutes: 20 },
    ready: 170,
    pickedUp: 166,
    delivered: 140,
    rider: { name: 'Sachin P.', phoneMasked: '+91 88XXX XX019' },
  },
  {
    id: 'ord-4b7g3e',
    orderNumber: 'HGR-4B7G3E',
    status: 'cancelled',
    customer: { firstName: 'Rohit', phoneMasked: '+91 97XXX XX093' },
    locality: 'Kharadi',
    distanceMeters: 6100,
    paymentMethod: 'online',
    paymentStatus: 'refunded',
    items: [line(dishes.muttonRoganJosh, 2), line(dishes.garlicNaan, 3)],
    extras: { deliveryRupees: 55 },
    placed: 95,
    cancelled: { at: 93, by: 'restaurant', reason: 'item_out_of_stock' },
  },
  {
    id: 'ord-9e2u6h',
    orderNumber: 'HGR-9E2U6H',
    status: 'cancelled',
    customer: { firstName: 'Neha', phoneMasked: '+91 99XXX XX560' },
    locality: 'Camp',
    distanceMeters: 3900,
    paymentMethod: 'cod',
    paymentStatus: 'not_applicable',
    items: [line(dishes.vegBiryani, 1), line(dishes.gulabJamun, 1)],
    extras: { deliveryRupees: 40 },
    placed: 120,
    cancelled: { at: 118, by: 'customer', reason: 'customer_changed_mind' },
  },
];

/** Builds the append-only history implied by the milestones the order has reached. */
function timelineFor(seed: OrderSeed, at: (minutesAgo: number) => string): OrderStatusEvent[] {
  const events: OrderStatusEvent[] = [
    { fromStatus: null, toStatus: 'placed', actor: 'customer', at: at(seed.placed) },
  ];
  const push = (toStatus: OrderStatus, actor: OrderActor, minutesAgo: number) => {
    const fromStatus = events[events.length - 1]?.toStatus ?? null;
    events.push({ fromStatus, toStatus, actor, at: at(minutesAgo) });
  };
  if (seed.accepted) push('preparing', 'restaurant', seed.accepted.at);
  if (seed.ready !== undefined) push('ready_for_pickup', 'restaurant', seed.ready);
  if (seed.pickedUp !== undefined) push('picked_up', 'delivery_partner', seed.pickedUp);
  if (seed.delivered !== undefined) push('delivered', 'delivery_partner', seed.delivered);
  if (seed.cancelled) push('cancelled', seed.cancelled.by, seed.cancelled.at);
  return events;
}

/** The demo restaurant's orders, timed relative to `now`. */
export function masalaJunctionOrders(now: Date): PartnerOrder[] {
  lineCounter = 0;
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  return seeds().map((seed) => {
    const timeline = timelineFor(seed, at);
    return {
      id: seed.id,
      orderNumber: seed.orderNumber,
      restaurantId: MASALA_JUNCTION_ID,
      status: seed.status,
      paymentMethod: seed.paymentMethod,
      paymentStatus: seed.paymentStatus,
      customer: seed.customer,
      items: seed.items,
      bill: billFor(seed.items, seed.extras),
      ...(seed.specialInstructions ? { specialInstructions: seed.specialInstructions } : {}),
      delivery: {
        locality: seed.locality,
        distanceMeters: seed.distanceMeters,
        rider: seed.rider ?? null,
      },
      prepMinutes: seed.accepted?.prepMinutes ?? null,
      placedAt: at(seed.placed),
      acceptedAt: seed.accepted ? at(seed.accepted.at) : null,
      estimatedReadyAt: seed.accepted ? at(seed.accepted.at - seed.accepted.prepMinutes) : null,
      readyAt: seed.ready !== undefined ? at(seed.ready) : null,
      pickedUpAt: seed.pickedUp !== undefined ? at(seed.pickedUp) : null,
      deliveredAt: seed.delivered !== undefined ? at(seed.delivered) : null,
      cancelledAt: seed.cancelled ? at(seed.cancelled.at) : null,
      cancelledBy: seed.cancelled?.by ?? null,
      cancellationReason: seed.cancelled?.reason ?? null,
      timeline,
      // One version per recorded change, like `orders.version` after each transition.
      version: timeline.length,
    };
  });
}
