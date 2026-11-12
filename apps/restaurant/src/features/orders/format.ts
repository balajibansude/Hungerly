import type { Order } from '@hungerly/api-client';
import type { BadgeTone } from '@hungerly/ui';
import { formatLocalTime, formatLocalTime12h, IST_UTC_OFFSET_MINUTES } from '@hungerly/utils';

import { readyByIso } from './board';

/** Kitchen clocks run on restaurant (IST) time, whatever the phone's timezone. */
function istParts(iso: string) {
  const shifted = new Date(Date.parse(iso) + IST_UTC_OFFSET_MINUTES * 60_000);
  return {
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth(),
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1:05 pm" */
export function formatClock(iso: string): string {
  return formatLocalTime12h(formatLocalTime(istParts(iso).minutes));
}

/** "Fri, 2 Oct, 1:05 pm" */
export function formatDateTime(iso: string): string {
  const { weekday, day, month } = istParts(iso);
  return `${WEEKDAYS[weekday]}, ${day} ${MONTHS[month]}, ${formatClock(iso)}`;
}

/** "2 Oct" for an ISO instant or a "YYYY-MM-DD" local date. */
export function formatShortDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, m, d] = value.split('-').map(Number);
    return `${d} ${MONTHS[(m ?? 1) - 1]}`;
  }
  const { day, month } = istParts(value);
  return `${day} ${MONTHS[month]}`;
}

export function minutesBetween(fromIso: string, to: Date): number {
  return Math.floor((to.getTime() - Date.parse(fromIso)) / 60_000);
}

/** "just now", "8 min ago", "2 h 5 min ago" */
export function formatAgo(iso: string, now: Date): string {
  const minutes = Math.max(0, minutesBetween(iso, now));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min ago` : `${hours} h ago`;
}

/** Seconds left to accept, or null when not applicable. Never negative. */
export function acceptSecondsLeft(order: Pick<Order, 'status' | 'acceptBy'>, now: Date): number | null {
  if (order.status !== 'placed' || !order.acceptBy) return null;
  return Math.max(0, Math.floor((Date.parse(order.acceptBy) - now.getTime()) / 1000));
}

/** "2:05" */
export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export interface KitchenTiming {
  label: string;
  tone: BadgeTone;
}

/** The time-sensitive line for an order on the board, or `null` when nothing is pending. */
export function kitchenTiming(order: Order, now: Date): KitchenTiming | null {
  switch (order.status) {
    case 'placed': {
      const left = acceptSecondsLeft(order, now);
      if (left === null) {
        const waited = minutesBetween(order.placedAt, now);
        return { label: `Waiting ${waited} min`, tone: 'info' };
      }
      if (left === 0) return { label: 'Accept time is up', tone: 'error' };
      return { label: `Accept within ${formatCountdown(left)}`, tone: left <= 60 ? 'error' : 'warning' };
    }
    case 'preparing': {
      const readyBy = readyByIso(order);
      if (!readyBy) return null;
      const left = -minutesBetween(readyBy, now);
      if (left > 0) return { label: `Ready in ${left} min · by ${formatClock(readyBy)}`, tone: 'warning' };
      if (left === 0) return { label: 'Due now', tone: 'warning' };
      return { label: `Overdue ${-left} min`, tone: 'error' };
    }
    case 'ready_for_pickup':
      return order.readyAt ? { label: `Ready since ${formatClock(order.readyAt)}`, tone: 'success' } : null;
    default:
      return null;
  }
}

export const REJECT_REASON_OPTIONS = [
  { value: 'item_out_of_stock', label: 'Item out of stock' },
  { value: 'too_busy', label: 'Kitchen too busy' },
  { value: 'closing', label: 'Closing soon' },
  { value: 'other', label: 'Other reason' },
] as const;
export type RejectReason = (typeof REJECT_REASON_OPTIONS)[number]['value'];

/** Owner-facing words for who cancelled and why. */
export function cancellationLabel(order: Pick<Order, 'cancelReason' | 'cancelledBy'>): string {
  const reason = REJECT_REASON_OPTIONS.find((o) => o.value === order.cancelReason);
  switch (order.cancelledBy) {
    case 'restaurant':
      return reason ? `Rejected: ${reason.label.toLowerCase()}` : 'Rejected by the restaurant';
    case 'customer':
      return 'Cancelled by the customer';
    case 'admin':
      return 'Cancelled by Swaadone support';
    case 'system':
      return order.cancelReason === 'not_accepted_in_time'
        ? 'Cancelled: not accepted in time'
        : 'Cancelled automatically';
    default:
      return 'Cancelled';
  }
}

const paymentMethodLabels: Record<Order['paymentMethod'], string> = {
  online: 'Paid online',
  cod: 'Cash on delivery',
};

const paymentStatusLabels: Record<Order['paymentStatus'], string> = {
  pending: 'payment pending',
  paid: 'paid',
  failed: 'payment failed',
  refund_pending: 'refund in progress',
  partially_refunded: 'partly refunded',
  refunded: 'refunded',
  not_applicable: 'no payment taken',
};

/** "Paid online", "Cash on delivery · payment pending", "Paid online · refund in progress". */
export function paymentLabel(order: Pick<Order, 'paymentMethod' | 'paymentStatus'>): string {
  const method = paymentMethodLabels[order.paymentMethod];
  if (order.paymentMethod === 'online' && order.paymentStatus === 'paid') return method;
  return `${method} · ${paymentStatusLabels[order.paymentStatus]}`;
}
