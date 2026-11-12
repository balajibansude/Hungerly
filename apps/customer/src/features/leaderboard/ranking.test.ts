import { money } from '@hungerly/utils';

import {
  daysLeftInMonth,
  monthLabel,
  publicName,
  rankCity,
  type LeaderboardEntry,
} from './ranking';

const entry = (
  customerId: string,
  completedOrders: number,
  rupees: number,
  city = 'Pune',
): LeaderboardEntry => ({
  customerId,
  name: customerId,
  city,
  completedOrders,
  totalSpent: money(rupees * 100),
});

describe('rankCity', () => {
  it('ranks by completed orders first', () => {
    const ranked = rankCity([entry('a', 3, 9000), entry('b', 7, 100), entry('c', 5, 500)], 'Pune');
    expect(ranked.map((e) => [e.customerId, e.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
  });

  it('breaks equal order counts by total spent', () => {
    const ranked = rankCity([entry('a', 5, 1200), entry('b', 5, 3400)], 'Pune');
    expect(ranked.map((e) => e.customerId)).toEqual(['b', 'a']);
  });

  it('only includes customers from the requested city', () => {
    const ranked = rankCity([entry('a', 9, 100, 'Mumbai'), entry('b', 1, 100)], 'Pune');
    expect(ranked.map((e) => [e.customerId, e.rank])).toEqual([['b', 1]]);
  });

  it('keeps a stable order when customers are fully tied', () => {
    const ranked = rankCity([entry('z', 2, 100), entry('m', 2, 100)], 'Pune');
    expect(ranked.map((e) => e.customerId)).toEqual(['m', 'z']);
  });
});

describe('month helpers', () => {
  const nov9 = new Date(2026, 10, 9);
  it('labels the current and following month, across year ends', () => {
    expect(monthLabel(nov9)).toBe('November 2026');
    expect(monthLabel(nov9, 1)).toBe('December 2026');
    expect(monthLabel(new Date(2026, 11, 31), 1)).toBe('January 2027');
  });

  it('counts the days left including today', () => {
    expect(daysLeftInMonth(nov9)).toBe(22);
    expect(daysLeftInMonth(new Date(2026, 10, 30))).toBe(1);
  });
});

describe('publicName', () => {
  it('shortens surnames', () => {
    expect(publicName('Priya Sharma')).toBe('Priya S.');
    expect(publicName('  Aarav  ')).toBe('Aarav');
  });
});
