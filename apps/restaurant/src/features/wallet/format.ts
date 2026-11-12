import type { LedgerEntryType, Money } from '@hungerly/api-client';
import type { IconName } from '@hungerly/ui';
import { formatMoney, IST_UTC_OFFSET_MINUTES, parseRupees } from '@hungerly/utils';

/** Display helpers for wallet figures. Amounts are always what the server sent. */

export const formatAmount = (value: Money): string => formatMoney(value);

/** What a person typed in rupees → paise, or null when it is not a valid amount. */
export function rupeesToPaise(input: string): number | null {
  return parseRupees(input)?.amountMinor ?? null;
}

/** Paise → an editable rupee string ("1499.50", "250"). */
export function paiseToRupeesInput(amountMinor: number): string {
  const whole = Math.floor(amountMinor / 100);
  const fraction = amountMinor % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}

export type Period = '7d' | '30d' | 'month';

export const PERIOD_LABELS: Record<Period, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
};

const DAY_MS = 86_400_000;

/** Today's calendar date in India ("YYYY-MM-DD"). */
export function istDate(now: Date): string {
  return new Date(now.getTime() + IST_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Inclusive IST date range for a period, as the summary endpoint expects. */
export function periodRange(period: Period, now: Date): { from: string; to: string } {
  const to = istDate(now);
  if (period === '7d') return { from: shiftDate(to, -6), to };
  if (period === '30d') return { from: shiftDate(to, -29), to };
  return { from: `${to.slice(0, 8)}01`, to };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Oct, 2:05 pm" in India time. */
export function formatIstDateTime(iso: string): string {
  const shifted = new Date(Date.parse(iso) + IST_UTC_OFFSET_MINUTES * 60_000);
  const h24 = shifted.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${shifted.getUTCDate()} ${MONTHS[shifted.getUTCMonth()]}, ${h12}:${minutes} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** "12 Oct" for a local date string. */
export function formatShortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

export const ledgerTypeMeta: Record<LedgerEntryType, { label: string; icon: IconName }> = {
  order_earning: { label: 'Order earning', icon: 'receipt-outline' },
  commission: { label: 'Swaadone commission', icon: 'pie-chart-outline' },
  commission_tax: { label: 'GST on commission', icon: 'document-text-outline' },
  restaurant_discount: { label: 'Your coupon discount', icon: 'pricetag-outline' },
  refund_deduction: { label: 'Refund deduction', icon: 'return-down-back-outline' },
  adjustment: { label: 'Adjustment', icon: 'construct-outline' },
  payout: { label: 'Withdrawal', icon: 'arrow-up-circle-outline' },
  payout_reversal: { label: 'Withdrawal returned', icon: 'arrow-down-circle-outline' },
};

/** A credit still in the settlement hold at `now`. */
export function isHeld(entry: { amount: Money; availableAt: string }, now: Date): boolean {
  return entry.amount.amountMinor > 0 && Date.parse(entry.availableAt) > now.getTime();
}
