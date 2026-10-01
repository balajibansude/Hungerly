import type { DayOfWeek, LocalTime, OpeningHoursSlot, PartnerRestaurant } from '@hungerly/types';

const MINUTES_PER_DAY = 24 * 60;

/** India Standard Time (UTC+05:30). IST has no daylight saving, so a fixed offset is exact. */
export const IST_UTC_OFFSET_MINUTES = 330;

/** A moment expressed as wall-clock time in the restaurant's timezone. */
export interface LocalDayTime {
  dayOfWeek: DayOfWeek;
  /** Minutes since local midnight, 0–1439. */
  minutes: number;
}

/** Parses "HH:MM" (24-hour) into minutes since midnight. Throws on malformed input. */
export function parseLocalTime(value: LocalTime): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid local time "${value}", expected HH:MM`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Formats minutes since midnight as "HH:MM". */
export function formatLocalTime(minutes: number): LocalTime {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Converts an instant to local weekday + time. Weekdays follow the schema's ISO
 * convention (0 = Monday), not JavaScript's (0 = Sunday).
 */
export function toLocalDayTime(
  date: Date,
  utcOffsetMinutes: number = IST_UTC_OFFSET_MINUTES,
): LocalDayTime {
  const shifted = new Date(date.getTime() + utcOffsetMinutes * 60_000);
  const jsDay = shifted.getUTCDay();
  return {
    dayOfWeek: ((jsDay + 6) % 7) as DayOfWeek,
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/**
 * True if `at` falls inside any slot. Slots may be split (several per day) and may cross
 * midnight (`closesAt <= opensAt`): a Friday 18:00–02:00 slot covers Saturday 01:30.
 * A slot whose open and close times are equal covers the full 24 hours.
 */
export function isWithinHours(hours: OpeningHoursSlot[], at: LocalDayTime): boolean {
  return hours.some((slot) => {
    const opens = parseLocalTime(slot.opensAt);
    const closes = parseLocalTime(slot.closesAt);
    if (closes > opens) {
      return at.dayOfWeek === slot.dayOfWeek && at.minutes >= opens && at.minutes < closes;
    }
    const nextDay = (slot.dayOfWeek + 1) % 7;
    if (at.dayOfWeek === slot.dayOfWeek) return at.minutes >= opens;
    return at.dayOfWeek === nextDay && at.minutes < closes;
  });
}

/** `isWithinHours` for an instant, in the given timezone (IST by default). */
export function isOpenAt(
  hours: OpeningHoursSlot[],
  date: Date,
  utcOffsetMinutes: number = IST_UTC_OFFSET_MINUTES,
): boolean {
  return isWithinHours(hours, toLocalDayTime(date, utcOffsetMinutes));
}

/** Why a restaurant cannot take orders right now, or `null` if it can. */
export type OrderIntakeBlocker = 'not_active' | 'offline' | 'outside_hours';

/**
 * The database rule for receiving orders (DATABASE_SCHEMA §4.3): the restaurant must be
 * `active`, switched online (`is_accepting_orders`) and within its opening hours.
 */
export function orderIntakeBlocker(
  restaurant: Pick<PartnerRestaurant, 'status' | 'isAcceptingOrders' | 'hours'>,
  now: Date,
  utcOffsetMinutes: number = IST_UTC_OFFSET_MINUTES,
): OrderIntakeBlocker | null {
  if (restaurant.status !== 'active') return 'not_active';
  if (!restaurant.isAcceptingOrders) return 'offline';
  if (!isOpenAt(restaurant.hours, now, utcOffsetMinutes)) return 'outside_hours';
  return null;
}

export function canAcceptOrders(
  restaurant: Pick<PartnerRestaurant, 'status' | 'isAcceptingOrders' | 'hours'>,
  now: Date,
  utcOffsetMinutes: number = IST_UTC_OFFSET_MINUTES,
): boolean {
  return orderIntakeBlocker(restaurant, now, utcOffsetMinutes) === null;
}

/** "11:30" → "11:30 am", "00:30" → "12:30 am", "12:00" → "12:00 pm". */
export function formatLocalTime12h(value: LocalTime): string {
  const minutes = parseLocalTime(value);
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minutes % 60).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** True when the slot closes after midnight, i.e. its closing time is earlier than its opening. */
export function crossesMidnight(slot: Pick<OpeningHoursSlot, 'opensAt' | 'closesAt'>): boolean {
  return parseLocalTime(slot.closesAt) < parseLocalTime(slot.opensAt);
}

export type WeeklyHoursIssue =
  | { code: 'no_open_days' }
  | { code: 'invalid_time'; dayOfWeek: DayOfWeek }
  | { code: 'same_time'; dayOfWeek: DayOfWeek }
  | { code: 'overlap'; dayOfWeek: DayOfWeek; withDayOfWeek: DayOfWeek };

const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

/**
 * Checks a weekly schedule entered by a person: at least one slot, valid "HH:MM" times,
 * open ≠ close (24-hour slots are not offered in forms), and no two slots overlapping —
 * including a late slot spilling past midnight into the next day's opening (Sunday wraps
 * to Monday). Returns the first issue in weekday order, or `null` if the schedule is valid.
 */
export function validateWeeklyHours(hours: OpeningHoursSlot[]): WeeklyHoursIssue | null {
  if (hours.length === 0) return { code: 'no_open_days' };

  const sorted = [...hours].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const intervals: { start: number; end: number; dayOfWeek: DayOfWeek }[] = [];
  for (const slot of sorted) {
    let opens: number;
    let closes: number;
    try {
      opens = parseLocalTime(slot.opensAt);
      closes = parseLocalTime(slot.closesAt);
    } catch {
      return { code: 'invalid_time', dayOfWeek: slot.dayOfWeek };
    }
    if (opens === closes) return { code: 'same_time', dayOfWeek: slot.dayOfWeek };
    const start = slot.dayOfWeek * MINUTES_PER_DAY + opens;
    const length = closes > opens ? closes - opens : MINUTES_PER_DAY - opens + closes;
    const end = start + length;
    // A Sunday-night slot continues into Monday morning at the start of the week.
    if (end > MINUTES_PER_WEEK) {
      intervals.push({ start, end: MINUTES_PER_WEEK, dayOfWeek: slot.dayOfWeek });
      intervals.push({ start: 0, end: end - MINUTES_PER_WEEK, dayOfWeek: slot.dayOfWeek });
    } else {
      intervals.push({ start, end, dayOfWeek: slot.dayOfWeek });
    }
  }

  // Sweep in start order, remembering the interval that reaches furthest so far: any
  // interval starting before that end overlaps it, even if they are not neighbours.
  const byStart = [...intervals].sort((a, b) => a.start - b.start);
  let furthest = byStart[0];
  let issue: { code: 'overlap'; dayOfWeek: DayOfWeek; withDayOfWeek: DayOfWeek } | null = null;
  for (const current of byStart.slice(1)) {
    if (furthest && current.start < furthest.end) {
      const [first, second] = [furthest.dayOfWeek, current.dayOfWeek].sort((a, b) => a - b) as [
        DayOfWeek,
        DayOfWeek,
      ];
      if (!issue || first < issue.dayOfWeek) {
        issue = { code: 'overlap', dayOfWeek: first, withDayOfWeek: second };
      }
    }
    if (!furthest || current.end > furthest.end) furthest = current;
  }
  return issue;
}
