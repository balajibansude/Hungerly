import type { OpeningHoursSlot } from '@hungerly/types';

import {
  canAcceptOrders,
  formatLocalTime,
  isOpenAt,
  isWithinHours,
  orderIntakeBlocker,
  parseLocalTime,
  toLocalDayTime,
} from './hours';

/** An instant given as IST wall-clock time (UTC+05:30). */
function ist(isoLocal: string): Date {
  return new Date(`${isoLocal}+05:30`);
}

// 2026-10-02 is a Friday (ISO day 4); 2026-10-03 a Saturday; 2026-10-05 a Monday.
const FRIDAY = 4;
const SATURDAY = 5;
const SUNDAY = 6;

describe('local time', () => {
  it('parses and formats HH:MM', () => {
    expect(parseLocalTime('00:00')).toBe(0);
    expect(parseLocalTime('09:30')).toBe(570);
    expect(parseLocalTime('23:59')).toBe(1439);
    expect(formatLocalTime(570)).toBe('09:30');
    expect(formatLocalTime(1440 + 15)).toBe('00:15');
  });

  it('rejects malformed times', () => {
    expect(() => parseLocalTime('24:00')).toThrow();
    expect(() => parseLocalTime('9:30')).toThrow();
    expect(() => parseLocalTime('12:60')).toThrow();
  });

  it('converts instants to IST weekday and minutes, Monday = 0', () => {
    expect(toLocalDayTime(ist('2026-10-02T13:15:00'))).toEqual({ dayOfWeek: FRIDAY, minutes: 795 });
    expect(toLocalDayTime(ist('2026-10-05T00:10:00'))).toEqual({ dayOfWeek: 0, minutes: 10 });
    // 20:00 UTC on Saturday is already 01:30 on Sunday in India.
    expect(toLocalDayTime(new Date('2026-10-03T20:00:00Z'))).toEqual({
      dayOfWeek: SUNDAY,
      minutes: 90,
    });
  });
});

describe('opening hours', () => {
  const splitShift: OpeningHoursSlot[] = [
    { dayOfWeek: FRIDAY, opensAt: '11:00', closesAt: '15:00' },
    { dayOfWeek: FRIDAY, opensAt: '18:00', closesAt: '23:00' },
  ];

  it('handles split shifts', () => {
    expect(isOpenAt(splitShift, ist('2026-10-02T12:00:00'))).toBe(true);
    expect(isOpenAt(splitShift, ist('2026-10-02T16:30:00'))).toBe(false);
    expect(isOpenAt(splitShift, ist('2026-10-02T19:00:00'))).toBe(true);
  });

  it('opens inclusive and closes exclusive', () => {
    expect(isOpenAt(splitShift, ist('2026-10-02T11:00:00'))).toBe(true);
    expect(isOpenAt(splitShift, ist('2026-10-02T15:00:00'))).toBe(false);
  });

  it('only applies a slot to its own weekday', () => {
    expect(isOpenAt(splitShift, ist('2026-10-03T12:00:00'))).toBe(false);
  });

  it('carries a slot that crosses midnight into the next day', () => {
    const lateNight: OpeningHoursSlot[] = [
      { dayOfWeek: FRIDAY, opensAt: '18:00', closesAt: '02:00' },
    ];
    expect(isOpenAt(lateNight, ist('2026-10-02T23:30:00'))).toBe(true);
    expect(isOpenAt(lateNight, ist('2026-10-03T01:30:00'))).toBe(true);
    expect(isOpenAt(lateNight, ist('2026-10-03T02:00:00'))).toBe(false);
    expect(isOpenAt(lateNight, ist('2026-10-02T01:30:00'))).toBe(false);
  });

  it('wraps a Sunday-night slot into Monday', () => {
    const sunday: OpeningHoursSlot[] = [{ dayOfWeek: SUNDAY, opensAt: '20:00', closesAt: '01:00' }];
    expect(isOpenAt(sunday, ist('2026-10-05T00:30:00'))).toBe(true);
  });

  it('treats equal open and close times as open all day', () => {
    const allDay: OpeningHoursSlot[] = [
      { dayOfWeek: SATURDAY, opensAt: '00:00', closesAt: '00:00' },
    ];
    expect(isWithinHours(allDay, { dayOfWeek: SATURDAY, minutes: 0 })).toBe(true);
    expect(isWithinHours(allDay, { dayOfWeek: SATURDAY, minutes: 1439 })).toBe(true);
    expect(isWithinHours(allDay, { dayOfWeek: SUNDAY, minutes: 0 })).toBe(false);
  });

  it('is closed with no hours', () => {
    expect(isOpenAt([], ist('2026-10-02T12:00:00'))).toBe(false);
  });
});

describe('order intake', () => {
  const hours: OpeningHoursSlot[] = [{ dayOfWeek: FRIDAY, opensAt: '11:00', closesAt: '23:00' }];
  const lunchtime = ist('2026-10-02T13:00:00');

  it('accepts orders only when active, online and within hours', () => {
    const restaurant = { status: 'active', isAcceptingOrders: true, hours } as const;
    expect(canAcceptOrders(restaurant, lunchtime)).toBe(true);
    expect(orderIntakeBlocker(restaurant, lunchtime)).toBeNull();
  });

  it('explains why orders are blocked, checking status first', () => {
    expect(
      orderIntakeBlocker({ status: 'pending_review', isAcceptingOrders: true, hours }, lunchtime),
    ).toBe('not_active');
    expect(
      orderIntakeBlocker({ status: 'active', isAcceptingOrders: false, hours }, lunchtime),
    ).toBe('offline');
    expect(
      orderIntakeBlocker(
        { status: 'active', isAcceptingOrders: true, hours },
        ist('2026-10-02T23:30:00'),
      ),
    ).toBe('outside_hours');
  });
});
