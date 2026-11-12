import { randomInt } from 'node:crypto';

import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm';

import type { Order, OrderStatus } from '@hungerly/api-client';
import type { OrderActor } from '@hungerly/types';
import { canTransition, IST_UTC_OFFSET_MINUTES, isValidPrepMinutes } from '@hungerly/utils';

import type { AppDeps } from '../../app';
import type { Db } from '../../db/client';
import { branches, menuItems, orderItems, orders, orderStatusEvents, platformPricingConfigs } from '../../db/schema';
import { AppError, conflict, notFound, unprocessable } from '../../lib/errors';
import { inr } from '../../lib/money';
import { iso } from '../../lib/time';
import { loadAvailability } from '../branches/availability';
import { postOrderEarnings } from '../wallet/ledger';

type OrderRow = typeof orders.$inferSelect;
type Deps = Pick<AppDeps, 'config' | 'clock'>;

export const ACTIVE_STATUSES = ['placed', 'preparing', 'ready_for_pickup'] as const;

const ORDER_NUMBER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

// --- Night charge helpers ---------------------------------------------------------------

function parseHHMM(value: string): number {
  const [h = 0, m = 0] = value.split(':').map(Number);
  return h * 60 + m;
}

function isInsideNightWindow(istMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (startMinutes > endMinutes) {
    return istMinutes >= startMinutes || istMinutes < endMinutes;
  }
  return istMinutes >= startMinutes && istMinutes < endMinutes;
}

/**
 * Returns the night surcharge in paise for this order.
 * Uses the server's current IST time (not client time) to determine eligibility.
 */
async function computeNightCharge(
  db: Db,
  now: Date,
  subtotalMinor: number,
): Promise<{ amountMinor: number; configSnapshot: Record<string, unknown> | null }> {
  const [config] = await db
    .select()
    .from(platformPricingConfigs)
    .orderBy(platformPricingConfigs.createdAt)
    .limit(1);

  if (!config || !config.nightChargeEnabled) {
    return { amountMinor: 0, configSnapshot: null };
  }

  const istMs = now.getTime() + IST_UTC_OFFSET_MINUTES * 60_000;
  const istMinutes = Math.floor((istMs % (24 * 60 * 60_000)) / 60_000);
  const startMinutes = parseHHMM(config.nightStart);
  const endMinutes = parseHHMM(config.nightEnd);

  if (!isInsideNightWindow(istMinutes, startMinutes, endMinutes)) {
    return { amountMinor: 0, configSnapshot: null };
  }

  let amountMinor: number;
  if (config.chargeType === 'fixed') {
    amountMinor = config.chargeAmountMinor ?? 0;
  } else {
    const bps = config.chargePercentBps ?? 0;
    amountMinor = Math.floor((subtotalMinor * bps) / 10_000);
  }

  return {
    amountMinor,
    configSnapshot: {
      configId: config.id,
      nightChargeEnabled: config.nightChargeEnabled,
      chargeType: config.chargeType,
      chargeAmountMinor: config.chargeAmountMinor,
      chargePercentBps: config.chargePercentBps,
      nightStart: config.nightStart,
      nightEnd: config.nightEnd,
      timezone: config.timezone,
      appliedAt: now.toISOString(),
    },
  };
}

export function newOrderNumber(): string {
  let suffix = '';
  for (let i = 0; i < 6; i += 1)
    suffix += ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)];
  return `HGR-${suffix}`;
}

/** "+919876543210" → "+91 ******3210". Restaurants never see full customer numbers. */
export function maskPhone(phoneE164: string | null | undefined): string | null {
  if (!phoneE164) return null;
  return `${phoneE164.slice(0, 3)} ******${phoneE164.slice(-4)}`;
}

/** First word of a name, at most 30 characters. */
export function firstName(fullName: string): string {
  return (fullName.trim().split(/\s+/)[0] ?? 'Customer').slice(0, 30) || 'Customer';
}

// --- Placement ------------------------------------------------------------------------

export interface PlaceOrderInput {
  branchId: string;
  customerUserId?: string | null;
  customerName: string;
  customerPhoneE164?: string | null;
  deliveryLocality?: string | null;
  deliveryDistanceMeters?: number | null;
  instructions?: string | null;
  paymentMethod: 'online' | 'cod';
  /** Only ids and quantities are trusted; prices and names come from the menu. */
  items: { menuItemId: string; quantity: number; notes?: string | null }[];
  /**
   * Fees decided by the customer-side pricing service (delivery, platform, tax, tip) and
   * a validated coupon discount. The restaurant-side subtotal and packaging fee are always
   * computed here from the database.
   */
  charges?: {
    deliveryFeeMinor?: number;
    platformFeeMinor?: number;
    taxMinor?: number;
    tipMinor?: number;
    discountMinor?: number;
    restaurantDiscountMinor?: number;
    couponId?: string | null;
  };
  isDevFixture?: boolean;
}

/**
 * Creates an order for a branch. The branch row is locked and its availability is
 * evaluated *inside* the transaction, so an order can never slip in after closing, during
 * a break, while paused, offline or on a holiday — whatever the client believed.
 */
export async function placeOrder(db: Db, deps: Deps, input: PlaceOrderInput): Promise<OrderRow> {
  if (input.items.length === 0) throw unprocessable('validation', 'Add at least one item.');
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50) {
      throw unprocessable('validation', 'Quantities must be between 1 and 50.');
    }
  }
  const now = deps.clock();
  return db.transaction(async (tx) => {
    const [branch] = await tx
      .select()
      .from(branches)
      .where(eq(branches.id, input.branchId))
      .for('update')
      .limit(1);
    if (!branch) throw notFound('Restaurant not found.');
    const availability = await loadAvailability(tx, branch, now);
    if (!availability.acceptingOrders) {
      throw unprocessable('branch.unavailable', availability.reason);
    }

    const ids = [...new Set(input.items.map((i) => i.menuItemId))];
    const menuRows = await tx
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.branchId, branch.id), inArray(menuItems.id, ids)));
    const byId = new Map(menuRows.map((m) => [m.id, m]));
    for (const id of ids) {
      const menuItem = byId.get(id);
      if (!menuItem) throw unprocessable('validation', 'An item is not on this restaurant’s menu.');
      if (menuItem.isArchived || !menuItem.isAvailable) {
        throw unprocessable('validation', `${menuItem.name} is not available right now.`);
      }
    }

    const subtotalMinor = input.items.reduce(
      (total, i) => total + byId.get(i.menuItemId)!.priceMinor * i.quantity,
      0,
    );
    const charges = input.charges ?? {};
    const deliveryFeeMinor = charges.deliveryFeeMinor ?? 0;
    const platformFeeMinor = charges.platformFeeMinor ?? 0;
    const taxMinor = charges.taxMinor ?? 0;
    const tipMinor = charges.tipMinor ?? 0;
    const discountMinor = charges.discountMinor ?? 0;
    const restaurantDiscountMinor = charges.restaurantDiscountMinor ?? 0;
    for (const value of [
      deliveryFeeMinor,
      platformFeeMinor,
      taxMinor,
      tipMinor,
      discountMinor,
      restaurantDiscountMinor,
    ]) {
      if (!Number.isInteger(value) || value < 0)
        throw unprocessable('validation', 'Charges must be whole, non-negative paise.');
    }
    if (restaurantDiscountMinor > discountMinor || discountMinor > subtotalMinor) {
      throw unprocessable('validation', 'The discount is larger than allowed.');
    }
    if (subtotalMinor < branch.minOrderMinor) {
      throw unprocessable(
        'validation',
        `The minimum order here is ₹${(branch.minOrderMinor / 100).toFixed(0)}.`,
      );
    }
    const packagingFeeMinor = branch.packagingFeeMinor;

    // Night surcharge: computed from the server's IST clock, never trusted from the client.
    const { amountMinor: nightChargeMinor } = await computeNightCharge(tx, now, subtotalMinor);

    const totalMinor =
      subtotalMinor +
      packagingFeeMinor +
      deliveryFeeMinor +
      platformFeeMinor +
      taxMinor +
      tipMinor +
      nightChargeMinor -
      discountMinor;

    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber: newOrderNumber(),
        branchId: branch.id,
        customerUserId: input.customerUserId ?? null,
        customerFirstName: firstName(input.customerName),
        customerPhoneMasked: maskPhone(input.customerPhoneE164),
        deliveryLocality: input.deliveryLocality ?? null,
        deliveryDistanceMeters: input.deliveryDistanceMeters ?? null,
        instructions: input.instructions?.trim() || null,
        status: 'placed',
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentMethod === 'cod' ? 'not_applicable' : 'paid',
        subtotalMinor,
        packagingFeeMinor,
        deliveryFeeMinor,
        platformFeeMinor,
        taxMinor,
        tipMinor,
        nightChargeMinor,
        discountMinor,
        restaurantDiscountMinor,
        totalMinor,
        couponId: charges.couponId ?? null,
        placedAt: now,
        acceptBy: new Date(now.getTime() + deps.config.ORDER_ACCEPT_WINDOW_SECONDS * 1000),
        isDevFixture: input.isDevFixture ?? false,
      })
      .returning();
    await tx.insert(orderItems).values(
      input.items.map((i) => {
        const menuItem = byId.get(i.menuItemId)!;
        return {
          orderId: order!.id,
          menuItemId: menuItem.id,
          name: menuItem.name,
          foodType: menuItem.foodType,
          unitPriceMinor: menuItem.priceMinor,
          quantity: i.quantity,
          notes: i.notes?.trim() || null,
        };
      }),
    );
    await tx
      .insert(orderStatusEvents)
      .values({
        orderId: order!.id,
        fromStatus: null,
        toStatus: 'placed',
        actorType: 'customer',
        actorUserId: input.customerUserId ?? null,
        createdAt: now,
      });
    return order!;
  });
}

// --- Transitions ------------------------------------------------------------------------

interface TransitionInput {
  to: OrderStatus;
  actor: OrderActor;
  actorUserId?: string | null;
  expectedVersion?: number;
  note?: string | null;
  set?: Partial<typeof orders.$inferInsert>;
}

/**
 * Applies one state-machine move with optimistic locking. The UPDATE matches both the
 * current status and version, so two concurrent actions cannot both succeed.
 */
async function transition(
  db: Db,
  now: Date,
  order: OrderRow,
  input: TransitionInput,
): Promise<OrderRow> {
  if (input.expectedVersion !== undefined && input.expectedVersion !== order.version) {
    throw conflict('order.version_conflict', 'This order changed. Refresh to see the latest.');
  }
  if (!canTransition(order.status, input.to, input.actor)) {
    throw conflict(
      'order.invalid_transition',
      `An order that is ${order.status.replace(/_/g, ' ')} cannot be moved to ${input.to.replace(/_/g, ' ')}.`,
    );
  }
  const [updated] = await db
    .update(orders)
    .set({ ...input.set, status: input.to, version: order.version + 1, updatedAt: now })
    .where(
      and(
        eq(orders.id, order.id),
        eq(orders.version, order.version),
        eq(orders.status, order.status),
      ),
    )
    .returning();
  if (!updated)
    throw conflict('order.version_conflict', 'This order changed. Refresh to see the latest.');
  await db.insert(orderStatusEvents).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: input.to,
    actorType: input.actor,
    actorUserId: input.actorUserId ?? null,
    note: input.note ?? null,
    createdAt: now,
  });
  return updated;
}

export async function requireBranchOrder(
  db: Db,
  branchId: string,
  orderId: string,
): Promise<OrderRow> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.branchId, branchId)))
    .limit(1);
  if (!order) throw notFound('Order not found.');
  return order;
}

function expiredSet(order: OrderRow, now: Date): Partial<typeof orders.$inferInsert> {
  return {
    cancelledAt: now,
    cancelledBy: 'system',
    cancelReason: 'not_accepted_in_time',
    paymentStatus: order.paymentStatus === 'paid' ? 'refund_pending' : order.paymentStatus,
  };
}

/**
 * Accept-window expiry: a `placed` order not accepted by `acceptBy` is cancelled by the
 * system (online payments move to `refund_pending`). Applied lazily whenever the branch's
 * orders are read or acted on, so no background timer is needed for correctness.
 */
export async function expireOverdueOrders(db: Db, branchId: string, now: Date): Promise<number> {
  const overdue = await db
    .select()
    .from(orders)
    .where(
      and(eq(orders.branchId, branchId), eq(orders.status, 'placed'), lt(orders.acceptBy, now)),
    );
  let expired = 0;
  for (const order of overdue) {
    try {
      await transition(db, now, order, {
        to: 'cancelled',
        actor: 'system',
        note: 'Not accepted in time',
        set: expiredSet(order, now),
      });
      expired += 1;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      // Someone acted on it concurrently; their action wins.
    }
  }
  return expired;
}

export async function acceptOrder(
  db: Db,
  deps: Deps,
  branchId: string,
  orderId: string,
  input: { prepMinutes: number; expectedVersion: number; actorUserId: string },
) {
  const now = deps.clock();
  if (!isValidPrepMinutes(input.prepMinutes)) {
    throw unprocessable('validation', 'Choose a preparation time between 5 and 90 minutes.');
  }
  const order = await requireBranchOrder(db, branchId, orderId);
  if (order.status === 'placed' && order.acceptBy && order.acceptBy.getTime() <= now.getTime()) {
    await expireOverdueOrders(db, branchId, now);
    throw conflict(
      'order.invalid_transition',
      'This order was not accepted in time and has been cancelled. The customer will be refunded.',
    );
  }
  return transition(db, now, order, {
    to: 'preparing',
    actor: 'restaurant',
    actorUserId: input.actorUserId,
    expectedVersion: input.expectedVersion,
    set: { prepMinutes: input.prepMinutes, acceptedAt: now },
  });
}

export async function rejectOrder(
  db: Db,
  deps: Deps,
  branchId: string,
  orderId: string,
  input: { reason: string; expectedVersion: number; actorUserId: string },
) {
  const now = deps.clock();
  const order = await requireBranchOrder(db, branchId, orderId);
  return transition(db, now, order, {
    to: 'cancelled',
    actor: 'restaurant',
    actorUserId: input.actorUserId,
    expectedVersion: input.expectedVersion,
    note: input.reason,
    set: {
      cancelledAt: now,
      cancelledBy: 'restaurant',
      cancelReason: input.reason,
      paymentStatus: order.paymentStatus === 'paid' ? 'refund_pending' : order.paymentStatus,
    },
  });
}

export async function markReady(
  db: Db,
  deps: Deps,
  branchId: string,
  orderId: string,
  input: { expectedVersion: number; actorUserId: string },
) {
  const now = deps.clock();
  const order = await requireBranchOrder(db, branchId, orderId);
  return transition(db, now, order, {
    to: 'ready_for_pickup',
    actor: 'restaurant',
    actorUserId: input.actorUserId,
    expectedVersion: input.expectedVersion,
    set: { readyAt: now },
  });
}

/** Delivery-partner / system action (no partner route): rider collected the order. */
export async function markPickedUp(
  db: Db,
  deps: Deps,
  orderId: string,
  input: { riderFirstName?: string | null } = {},
) {
  const now = deps.clock();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw notFound('Order not found.');
  return transition(db, now, order, {
    to: 'picked_up',
    actor: 'delivery_partner',
    set: {
      pickedUpAt: now,
      riderFirstName: input.riderFirstName ? firstName(input.riderFirstName) : order.riderFirstName,
    },
  });
}

/**
 * Delivery-partner / system action: marks the order delivered and posts the restaurant's
 * earnings to the ledger in the same transaction. Calling it again on a delivered order
 * changes nothing (the ledger posting is idempotent).
 */
export async function markDelivered(db: Db, deps: Deps, orderId: string) {
  const now = deps.clock();
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for('update')
      .limit(1);
    if (!order) throw notFound('Order not found.');
    if (order.status === 'delivered') {
      await postOrderEarnings(tx, deps.config, order.id, order.deliveredAt ?? now);
      return order;
    }
    const updated = await transition(tx, now, order, {
      to: 'delivered',
      actor: 'delivery_partner',
      set: {
        deliveredAt: now,
        paymentStatus: order.paymentMethod === 'cod' ? 'paid' : order.paymentStatus,
      },
    });
    await postOrderEarnings(tx, deps.config, updated.id, now);
    return updated;
  });
}

// --- Reads ------------------------------------------------------------------------------

export async function toOrderDtos(db: Db, rows: OrderRow[]): Promise<Order[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [items, events] = await Promise.all([
    db.select().from(orderItems).where(inArray(orderItems.orderId, ids)),
    db
      .select()
      .from(orderStatusEvents)
      .where(inArray(orderStatusEvents.orderId, ids))
      .orderBy(asc(orderStatusEvents.createdAt)),
  ]);
  return rows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    branchId: o.branchId,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    customer: { firstName: o.customerFirstName, phoneMasked: o.customerPhoneMasked },
    delivery: {
      locality: o.deliveryLocality,
      distanceMeters: o.deliveryDistanceMeters,
      rider: o.riderFirstName ? { firstName: o.riderFirstName } : null,
    },
    instructions: o.instructions,
    items: items
      .filter((i) => i.orderId === o.id)
      .map((i) => {
        const optionTotal = i.options.reduce((t, opt) => t + opt.priceDeltaMinor, 0);
        return {
          id: i.id,
          menuItemId: i.menuItemId,
          name: i.name,
          foodType: i.foodType,
          quantity: i.quantity,
          unitPrice: inr(i.unitPriceMinor),
          lineTotal: inr((i.unitPriceMinor + optionTotal) * i.quantity),
          options: i.options.map((opt) => ({
            group: opt.group,
            name: opt.name,
            priceDelta: inr(opt.priceDeltaMinor),
          })),
          notes: i.notes,
        };
      }),
    bill: {
      subtotal: inr(o.subtotalMinor),
      packagingFee: inr(o.packagingFeeMinor),
      deliveryFee: inr(o.deliveryFeeMinor),
      platformFee: inr(o.platformFeeMinor),
      tax: inr(o.taxMinor),
      tip: inr(o.tipMinor),
      nightCharge: inr(o.nightChargeMinor ?? 0),
      discount: inr(o.discountMinor),
      restaurantFundedDiscount: inr(o.restaurantDiscountMinor),
      total: inr(o.totalMinor),
    },
    prepMinutes: o.prepMinutes,
    placedAt: o.placedAt.toISOString(),
    acceptBy: iso(o.acceptBy),
    acceptedAt: iso(o.acceptedAt),
    readyAt: iso(o.readyAt),
    deliveredAt: iso(o.deliveredAt),
    cancelledAt: iso(o.cancelledAt),
    cancelledBy: o.cancelledBy,
    cancelReason: o.cancelReason,
    timeline: events
      .filter((e) => e.orderId === o.id)
      .map((e) => ({
        status: e.toStatus,
        at: e.createdAt.toISOString(),
        actor: e.actorType,
        note: e.note,
      })),
    version: o.version,
    isDevFixture: o.isDevFixture,
  }));
}

export async function listOrders(
  db: Db,
  branchId: string,
  query: {
    status?: OrderStatus | 'active' | 'history';
    cursor: { p: string; i: string } | null;
    limit: number;
  },
) {
  const statusFilter =
    query.status === 'active'
      ? inArray(orders.status, [...ACTIVE_STATUSES])
      : query.status === 'history'
        ? inArray(orders.status, ['pending_payment', 'picked_up', 'delivered', 'cancelled'])
        : query.status
          ? eq(orders.status, query.status)
          : undefined;
  const cursorFilter = query.cursor
    ? or(
        lt(orders.placedAt, new Date(query.cursor.p)),
        and(eq(orders.placedAt, new Date(query.cursor.p)), lt(orders.id, query.cursor.i)),
      )
    : undefined;
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.branchId, branchId), statusFilter, cursorFilter))
    .orderBy(sql`${orders.placedAt} desc`, sql`${orders.id} desc`)
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    rows: page,
    next: rows.length > query.limit && last ? { p: last.placedAt.toISOString(), i: last.id } : null,
  };
}
