import { and, eq, gt, inArray, lte, sql, sum } from 'drizzle-orm';

import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { branches, ledgerEntries, orders, payouts } from '../../db/schema';

/**
 * Wallet accounting. The balance is never stored or sent by a client: it is always the
 * sum of append-only ledger rows, written only by server code paths:
 *
 *   order delivered → +order_earning (subtotal + packaging), −commission, −commission_tax,
 *                     −restaurant_discount   (available after the settlement hold)
 *   payout requested → −payout (immediately, so the money is reserved)
 *   payout failed/reversed/cancelled/rejected → +payout_reversal
 *   finance adjustment → ±adjustment / −refund_deduction (admin only, audited)
 *
 * Gross sales (what customers paid for food) are therefore *not* the balance.
 */

export const IN_FLIGHT_PAYOUT_STATUSES = ['requested', 'queued', 'pending_approval', 'processing'] as const;

export interface OrderEarnings {
  orderEarning: number;
  commission: number;
  commissionTax: number;
  restaurantDiscount: number;
  net: number;
}

/** Pure split of one delivered order. Commission is charged on the food subtotal. */
export function computeOrderEarnings(
  order: { subtotalMinor: number; packagingFeeMinor: number; restaurantDiscountMinor: number },
  commissionBps: number,
  commissionTaxBps: number,
): OrderEarnings {
  const orderEarning = order.subtotalMinor + order.packagingFeeMinor;
  const commission = Math.round((order.subtotalMinor * commissionBps) / 10_000);
  const commissionTax = Math.round((commission * commissionTaxBps) / 10_000);
  const restaurantDiscount = order.restaurantDiscountMinor;
  return {
    orderEarning,
    commission,
    commissionTax,
    restaurantDiscount,
    net: orderEarning - commission - commissionTax - restaurantDiscount,
  };
}

/**
 * Posts the ledger rows for a delivered order. Idempotent: a unique index on
 * (order_id, type) makes a second call a no-op, so retries never double-credit.
 * Call inside the transaction that marks the order delivered.
 */
export async function postOrderEarnings(db: Db, config: Config, orderId: string, deliveredAt: Date): Promise<void> {
  const [row] = await db
    .select({
      order: orders,
      commissionBps: branches.commissionBps,
    })
    .from(orders)
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) throw new Error(`Order ${orderId} not found`);
  const { order } = row;
  if (order.status !== 'delivered') throw new Error('Earnings are posted only for delivered orders');

  const commissionBps = row.commissionBps ?? config.DEFAULT_COMMISSION_BPS;
  const split = computeOrderEarnings(order, commissionBps, config.COMMISSION_TAX_BPS);
  const availableAt = new Date(deliveredAt.getTime() + config.SETTLEMENT_HOLD_DAYS * 86_400_000);
  // Earnings are recognised at delivery time (also what period summaries group by).
  const base = { branchId: order.branchId, orderId: order.id, availableAt, createdAt: deliveredAt, isDevFixture: order.isDevFixture };
  const rows = [
    { ...base, type: 'order_earning' as const, amountMinor: split.orderEarning, description: `Order ${order.orderNumber}` },
    { ...base, type: 'commission' as const, amountMinor: -split.commission, description: `Commission ${(commissionBps / 100).toFixed(2)}% · ${order.orderNumber}` },
    { ...base, type: 'commission_tax' as const, amountMinor: -split.commissionTax, description: `GST on commission · ${order.orderNumber}` },
    { ...base, type: 'restaurant_discount' as const, amountMinor: -split.restaurantDiscount, description: `Your coupon discount · ${order.orderNumber}` },
  ].filter((r) => r.amountMinor !== 0);
  if (rows.length) await db.insert(ledgerEntries).values(rows).onConflictDoNothing();
}

export interface Balances {
  available: number;
  pending: number;
  inFlightPayouts: number;
  includesDevFixtures: boolean;
}

/**
 * Available = every ledger row whose hold has passed (payout debits are available
 * immediately, so they reduce `available` the moment they are requested).
 * Pending = credits still on hold.
 */
export async function computeBalances(db: Db, branchId: string, now: Date): Promise<Balances> {
  const [availableRow] = await db
    .select({ total: sum(ledgerEntries.amountMinor) })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.branchId, branchId), lte(ledgerEntries.availableAt, now)));
  const [pendingRow] = await db
    .select({ total: sum(ledgerEntries.amountMinor) })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.branchId, branchId), gt(ledgerEntries.availableAt, now)));
  const [inFlightRow] = await db
    .select({ total: sum(payouts.amountMinor) })
    .from(payouts)
    .where(and(eq(payouts.branchId, branchId), inArray(payouts.status, [...IN_FLIGHT_PAYOUT_STATUSES])));
  const [fixtureRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.branchId, branchId), eq(ledgerEntries.isDevFixture, true)));
  return {
    available: Number(availableRow?.total ?? 0),
    pending: Number(pendingRow?.total ?? 0),
    inFlightPayouts: Number(inFlightRow?.total ?? 0),
    includesDevFixtures: (fixtureRow?.n ?? 0) > 0,
  };
}
