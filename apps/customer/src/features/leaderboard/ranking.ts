import type { Money } from '@hungerly/types';

/** One customer's totals for the leaderboard month, within a single city. */
export interface LeaderboardEntry {
  customerId: string;
  name: string;
  city: string;
  completedOrders: number;
  totalSpent: Money;
}

export interface RankedEntry extends LeaderboardEntry {
  /** 1-based position in the city for the month. */
  rank: number;
}

/** How many top customers win next month's offers. */
export const REWARDED_PLACES = 3;

/**
 * Orders customers within one city: more completed orders first, then more money spent.
 * Customers equal on both keep a stable alphabetical order so ranks never flicker.
 */
export function rankCity(entries: readonly LeaderboardEntry[], city: string): RankedEntry[] {
  return entries
    .filter((e) => e.city === city)
    .slice()
    .sort(
      (a, b) =>
        b.completedOrders - a.completedOrders ||
        b.totalSpent.amountMinor - a.totalSpent.amountMinor ||
        a.name.localeCompare(b.name),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** "November 2026" for the month containing `date`, shifted by `offset` months. */
export function monthLabel(date: Date, offset = 0): string {
  const shifted = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  return `${MONTHS[shifted.getMonth()]} ${shifted.getFullYear()}`;
}

/** Whole days left in the month containing `date`, counting today. */
export function daysLeftInMonth(date: Date): number {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return lastDay - date.getDate() + 1;
}

/** "Priya Sharma" → "Priya S." so the public board never shows full surnames. */
export function publicName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]!.toUpperCase()}.` : (first ?? '');
}
