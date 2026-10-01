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
