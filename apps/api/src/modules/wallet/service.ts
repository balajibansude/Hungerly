import { and, eq, gte, lt } from 'drizzle-orm';

import type { Wallet, WalletSummary } from '@hungerly/api-client';

import type { AppDeps } from '../../app';
import type { BranchRow } from '../../auth/guard';
import { ledgerEntries, orders } from '../../db/schema';
import { validationError } from '../../lib/errors';
import { inr } from '../../lib/money';
import { addDays, istDate, istMidnight } from '../../lib/time';
import { currentAccount, toAccountDto } from '../payouts/accounts';
import { computeBalances } from './ledger';

export async function getWallet(deps: AppDeps, branch: BranchRow): Promise<Wallet> {
  const { db, clock, config, payoutProvider } = deps;
  const now = clock();
  const [balances, account] = await Promise.all([computeBalances(db, branch.id, now), currentAccount(db, branch.id)]);

  const blockers: Wallet['eligibility']['blockers'] = [];
  if (payoutProvider.mode === 'unconfigured') {
    blockers.push({ code: 'provider_unconfigured', message: 'Swaadone has not enabled withdrawals yet.' });
  }
  if (branch.status !== 'active') {
    blockers.push({ code: 'branch_not_active', message: 'Withdrawals open once this branch is approved and active.' });
  }
  if (!account) {
    blockers.push({ code: 'no_payout_account', message: 'Add a bank account for this branch.' });
  } else if (account.status !== 'verified') {
    blockers.push({ code: 'payout_account_unverified', message: 'Your bank account is not verified yet.' });
  }
  if (balances.available < config.MIN_WITHDRAWAL_MINOR) {
    blockers.push({
      code: 'below_minimum',
      message: `You can withdraw once your available balance reaches ₹${(config.MIN_WITHDRAWAL_MINOR / 100).toFixed(0)}.`,
    });
  }

  return {
    branchId: branch.id,
    available: inr(balances.available),
    pending: inr(balances.pending),
    inFlightPayouts: inr(balances.inFlightPayouts),
    minimumWithdrawal: inr(config.MIN_WITHDRAWAL_MINOR),
    settlementHoldDays: config.SETTLEMENT_HOLD_DAYS,
    payoutAccount: account ? toAccountDto(account) : null,
    provider: { provider: 'razorpayx', mode: payoutProvider.mode },
    eligibility: { canWithdraw: blockers.length === 0, blockers },
    includesDevFixtures: balances.includesDevFixtures,
  };
}

export const MAX_SUMMARY_DAYS = 92;

export function validateRange(from: string, to: string): void {
  if (to < from) throw validationError('The end date must be on or after the start date.', { to: ['Before start'] });
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (days > MAX_SUMMARY_DAYS) {
    throw validationError(`Choose a range of at most ${MAX_SUMMARY_DAYS} days.`, { to: ['Range too long'] });
  }
}

/**
 * Period summary, by India date. Gross sales come from delivered orders (food subtotal);
 * every deduction comes from ledger rows created in the period. Deductions are reported
 * as positive amounts; `adjustments` and `netEarnings` are signed.
 */
export async function getSummary(deps: AppDeps, branch: BranchRow, from: string, to: string): Promise<WalletSummary> {
  validateRange(from, to);
  const { db } = deps;
  const start = istMidnight(from);
  const end = istMidnight(addDays(to, 1));

  const [deliveredOrders, entries] = await Promise.all([
    db
      .select({ subtotal: orders.subtotalMinor, deliveredAt: orders.deliveredAt, isDevFixture: orders.isDevFixture })
      .from(orders)
      .where(
        and(
          eq(orders.branchId, branch.id),
          eq(orders.status, 'delivered'),
          gte(orders.deliveredAt, start),
          lt(orders.deliveredAt, end),
        ),
      ),
    db
      .select({
        type: ledgerEntries.type,
        amount: ledgerEntries.amountMinor,
        createdAt: ledgerEntries.createdAt,
        isDevFixture: ledgerEntries.isDevFixture,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.branchId, branch.id), gte(ledgerEntries.createdAt, start), lt(ledgerEntries.createdAt, end))),
  ]);

  const daily = new Map<string, { gross: number; net: number }>();
  for (let date = from; date <= to; date = addDays(date, 1)) daily.set(date, { gross: 0, net: 0 });

  const totals = { gross: 0, commission: 0, commissionTax: 0, discounts: 0, refunds: 0, adjustments: 0, net: 0, paidOut: 0 };
  for (const order of deliveredOrders) {
    totals.gross += order.subtotal;
    const day = daily.get(istDate(order.deliveredAt!));
    if (day) day.gross += order.subtotal;
  }
  const EARNING_TYPES = new Set(['order_earning', 'commission', 'commission_tax', 'restaurant_discount', 'refund_deduction', 'adjustment']);
  for (const entry of entries) {
    switch (entry.type) {
      case 'commission':
        totals.commission -= entry.amount;
        break;
      case 'commission_tax':
        totals.commissionTax -= entry.amount;
        break;
      case 'restaurant_discount':
        totals.discounts -= entry.amount;
        break;
      case 'refund_deduction':
        totals.refunds -= entry.amount;
        break;
      case 'adjustment':
        totals.adjustments += entry.amount;
        break;
      case 'payout':
      case 'payout_reversal':
        totals.paidOut -= entry.amount;
        break;
      default:
        break;
    }
    if (EARNING_TYPES.has(entry.type)) {
      totals.net += entry.amount;
      const day = daily.get(istDate(entry.createdAt));
      if (day) day.net += entry.amount;
    }
  }

  return {
    from,
    to,
    deliveredOrders: deliveredOrders.length,
    grossSales: inr(totals.gross),
    commission: inr(totals.commission),
    commissionTax: inr(totals.commissionTax),
    restaurantDiscounts: inr(totals.discounts),
    refunds: inr(totals.refunds),
    adjustments: inr(totals.adjustments),
    netEarnings: inr(totals.net),
    paidOut: inr(totals.paidOut),
    daily: [...daily.entries()].map(([date, v]) => ({ date, grossSales: inr(v.gross), netEarnings: inr(v.net) })),
    includesDevFixtures: deliveredOrders.some((o) => o.isDevFixture) || entries.some((e) => e.isDevFixture),
  };
}

const TYPE_LABELS: Record<string, string> = {
  order_earning: 'Order earning',
  commission: 'Commission',
  commission_tax: 'GST on commission',
  restaurant_discount: 'Coupon discount',
  refund_deduction: 'Refund deduction',
  adjustment: 'Adjustment',
  payout: 'Withdrawal',
  payout_reversal: 'Withdrawal returned',
};

export function ledgerTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

/** "YYYY-MM-DD HH:MM" in India time. */
export function istTimestamp(at: Date): string {
  return new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' ');
}

export function csvField(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  // Quote everything that could break the row; neutralise spreadsheet formulas.
  const isNumber = /^-?\d+(\.\d+)?$/.test(text);
  const safe = !isNumber && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function rupees(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
