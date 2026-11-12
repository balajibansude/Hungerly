import { money } from '@hungerly/utils';

import type { LeaderboardEntry } from '@/features/leaderboard/ranking';

/**
 * Sample monthly totals for the city leaderboard (UI prototype only — no backend yet).
 * Amounts are in paise. Includes a deliberate tie on completed orders (Ishaan / Meera)
 * so the secondary "total spent" rule is visible on screen.
 */
export const leaderboardEntries: LeaderboardEntry[] = [
  {
    customerId: 'lb-01',
    name: 'Aarav Mehta',
    city: 'Pune',
    completedOrders: 24,
    totalSpent: money(1_186_000),
  },
  {
    customerId: 'lb-02',
    name: 'Ishaan Kulkarni',
    city: 'Pune',
    completedOrders: 21,
    totalSpent: money(948_500),
  },
  {
    customerId: 'lb-03',
    name: 'Meera Joshi',
    city: 'Pune',
    completedOrders: 21,
    totalSpent: money(1_032_000),
  },
  {
    customerId: 'lb-04',
    name: 'Rohan Deshpande',
    city: 'Pune',
    completedOrders: 17,
    totalSpent: money(712_000),
  },
  {
    customerId: 'lb-05',
    name: 'Sneha Patil',
    city: 'Pune',
    completedOrders: 14,
    totalSpent: money(655_000),
  },
  {
    customerId: 'lb-06',
    name: 'Kabir Shah',
    city: 'Pune',
    completedOrders: 11,
    totalSpent: money(498_000),
  },
  {
    customerId: 'lb-07',
    name: 'Ananya Rao',
    city: 'Pune',
    completedOrders: 6,
    totalSpent: money(231_000),
  },
  {
    customerId: 'lb-08',
    name: 'Vikram Nair',
    city: 'Mumbai',
    completedOrders: 30,
    totalSpent: money(1_540_000),
  },
  {
    customerId: 'lb-09',
    name: 'Zoya Khan',
    city: 'Mumbai',
    completedOrders: 19,
    totalSpent: money(880_000),
  },
];

/** Sample totals for whoever is signed in, placed into their delivery city. */
export const currentCustomerSample = {
  completedOrders: 9,
  totalSpent: money(418_000),
};
