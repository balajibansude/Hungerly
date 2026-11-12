import type { OpeningHoursSlot } from '@hungerly/types';

import { IST_UTC_OFFSET_MINUTES, parseLocalTime, toLocalDayTime } from './hours';

/**
 * Branch availability: is the branch taking new orders right now, and if not, why and
 * until when. One pure function, used by the API (authoritative: order placement and the
 * availability endpoint) and by the app (instant feedback while editing hours).
 *
 * A day can have several sessions (8:00–16:00 and 17:00–23:00); the gap between two
 * sessions on the same day is a *break*. Sessions may cross midnight. Full-day closures
 * (holidays) and a temporary pause override the schedule; the online switch and the
 * branch lifecycle status override everything.
 */

export type AvailabilityState =
  | 'open'
  | 'on_break'
  | 'closed_for_day'
  | 'not_open_yet'
  | 'holiday'
  | 'paused'
  | 'offline'
  | 'not_active';

export interface AvailabilityInput {
  status: 'draft' | 'pending_review' | 'active' | 'suspended' | 'rejected' | 'closed';
  isAcceptingOrders: boolean;
  pausedUntil: Date | null;
  sessions: OpeningHoursSlot[];
  /** Local dates ("YYYY-MM-DD") the branch is closed all day. */
  closedDates: string[];
  utcOffsetMinutes?: number;
}

export interface AvailabilityResult {
  state: AvailabilityState;
  acceptingOrders: boolean;
  reason: string;
  /** End of the current session, when open. */
  closesAt: Date | null;
  /** Next session start within the look-ahead window, ignoring the online switch. */
  nextOpenAt: Date | null;
}

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;
const LOOKAHEAD_DAYS = 14;

interface Interval {
  start: number;
  end: number;
  /** Local date the session belongs to (its opening day). */
  date: string;
}

function localDateString(epochMs: number, offset: number): string {
  return new Date(epochMs + offset * MINUTE).toISOString().slice(0, 10);
}

/** Epoch ms of local midnight for the local day containing `at`. */
function localMidnight(at: Date, offset: number): number {
  const shifted = at.getTime() + offset * MINUTE;
  return shifted - (shifted % (DAY_MINUTES * MINUTE)) - offset * MINUTE;
}

/**
 * Concrete session intervals (epoch ms) from the day before `at` through the look-ahead
 * window, skipping sessions that open on a closed date.
 */
function sessionIntervals(
  sessions: OpeningHoursSlot[],
  closedDates: Set<string>,
  at: Date,
  offset: number,
): Interval[] {
  const intervals: Interval[] = [];
  const todayMidnight = localMidnight(at, offset);
  for (let dayIndex = -1; dayIndex <= LOOKAHEAD_DAYS; dayIndex += 1) {
    const midnight = todayMidnight + dayIndex * DAY_MINUTES * MINUTE;
    const date = localDateString(midnight, offset);
    if (closedDates.has(date)) continue;
    const { dayOfWeek } = toLocalDayTime(new Date(midnight), offset);
    for (const session of sessions) {
      if (session.dayOfWeek !== dayOfWeek) continue;
      const opens = parseLocalTime(session.opensAt);
      const closes = parseLocalTime(session.closesAt);
      const length = closes > opens ? closes - opens : DAY_MINUTES - opens + closes;
      const start = midnight + opens * MINUTE;
      intervals.push({ start, end: start + length * MINUTE, date });
    }
  }
  return intervals.sort((a, b) => a.start - b.start);
}

function formatClock(epochMs: number, offset: number): string {
  const shifted = new Date(epochMs + offset * MINUTE);
  const h24 = shifted.getUTCHours();
  const m = shifted.getUTCMinutes();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

function describeNext(next: number | null, now: Date, offset: number): string {
  if (next === null) return 'No opening hours in the next two weeks.';
  const sameDay = localDateString(next, offset) === localDateString(now.getTime(), offset);
  const tomorrow =
    localDateString(next, offset) ===
    localDateString(now.getTime() + DAY_MINUTES * MINUTE, offset);
  const day = sameDay ? 'today' : tomorrow ? 'tomorrow' : 'on ' + localDateString(next, offset);
  return `Opens ${day} at ${formatClock(next, offset)}.`;
}

export function evaluateAvailability(input: AvailabilityInput, now: Date): AvailabilityResult {
  const offset = input.utcOffsetMinutes ?? IST_UTC_OFFSET_MINUTES;
  const closed = new Set(input.closedDates);
  const intervals = sessionIntervals(input.sessions, closed, now, offset);
  const t = now.getTime();
  const current = intervals.find((i) => i.start <= t && t < i.end) ?? null;
  const nextStart = intervals.find((i) => i.start > t)?.start ?? null;
  const nextOpenAt = nextStart === null ? null : new Date(nextStart);

  const result = (
    state: AvailabilityState,
    reason: string,
    extra: Partial<AvailabilityResult> = {},
  ): AvailabilityResult => ({
    state,
    acceptingOrders: state === 'open',
    reason,
    closesAt: null,
    nextOpenAt,
    ...extra,
  });

  if (input.status !== 'active') {
    const reasons: Record<AvailabilityInput['status'], string> = {
      draft: 'Finish onboarding and submit this branch for review.',
      pending_review: 'This branch is waiting for Swaadone review.',
      active: '',
      suspended: 'This branch is suspended. Contact Swaadone support.',
      rejected: 'This branch was not approved. See the review notes.',
      closed: 'This branch is permanently closed.',
    };
    return result('not_active', reasons[input.status]);
  }
  if (!input.isAcceptingOrders) {
    return result('offline', 'You switched this branch offline. Go online to take orders.');
  }
  if (input.pausedUntil && input.pausedUntil.getTime() > t) {
    return result('paused', `Orders paused until ${formatClock(input.pausedUntil.getTime(), offset)}.`);
  }
  if (current) {
    return result('open', `Open until ${formatClock(current.end, offset)}.`, {
      closesAt: new Date(current.end),
    });
  }

  const today = localDateString(t, offset);
  if (closed.has(today)) {
    return result('holiday', `Closed today (holiday). ${describeNext(nextStart, now, offset)}`);
  }
  const todays = intervals.filter((i) => i.date === today);
  const hadEarlier = todays.some((i) => i.end <= t);
  const hasLater = todays.some((i) => i.start > t);
  if (hadEarlier && hasLater) {
    return result('on_break', `On a break. ${describeNext(nextStart, now, offset)}`);
  }
  if (hasLater) {
    return result('not_open_yet', describeNext(nextStart, now, offset));
  }
  return result('closed_for_day', `Closed for today. ${describeNext(nextStart, now, offset)}`);
}
