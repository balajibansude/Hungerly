import {
  BranchDetailSchema,
  HoursResponseSchema,
  type HoursSession,
  paths,
  ReplaceHoursSchema,
  UpdateBranchSchema,
  type ApiClient,
} from '@hungerly/api-client';
import type { DayOfWeek } from '@hungerly/types';
import { validateWeeklyHours, type WeeklyHoursIssue } from '@hungerly/utils';

import { rupeesToPaise } from './money';

export type WeekdayName =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

/** ISO weekday the API stores (`restaurant_hours.day_of_week`): 0 = Monday … 6 = Sunday. */
export const WEEKDAY_INDEX: Record<WeekdayName, DayOfWeek> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

export interface OperationsDay {
  day: WeekdayName;
  label: string;
  isOpen: boolean;
  opensAt: string;
  closesAt: string;
  /** Optional mid-day break. Saved as two sessions: opensAt–breakStart and breakEnd–closesAt. */
  hasBreak?: boolean;
  breakStart?: string;
  breakEnd?: string;
}

export interface OperationsForm {
  hours: OperationsDay[];
  avgPrepMinutes: number;
  /** Rupees as typed; blank means no minimum order. */
  minOrderAmount: string;
}

export interface OperationsPayload {
  hours: { sessions: { dayOfWeek: DayOfWeek; opensAt: string; closesAt: string }[] };
  branch: { avgPrepMinutes: number; minimumOrderMinor: number };
}

export type OperationsResult =
  | { ok: true; payload: OperationsPayload }
  | { ok: false; errors: Partial<Record<'hours' | 'avgPrepMinutes' | 'minOrderAmount', string>> };

const HOURS_MESSAGES: Record<WeeklyHoursIssue['code'], string> = {
  no_open_days: 'Open on at least one day.',
  invalid_time: 'Use 24-hour times like 09:30 or 23:00.',
  same_time: 'Opening and closing times must be different.',
  overlap: 'Two days overlap. Close before the next day opens.',
};

const BREAK_ORDER_MESSAGE = 'The break must start after opening and end before closing.';
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(time: string): number | null {
  const match = TIME_PATTERN.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * True when opening < break start < break end < closing, measured from the opening time so
 * a day that closes after midnight (e.g. 18:00–02:00 with a 22:00–22:30 break) is accepted.
 * Returns null when a time is malformed (the weekly validator reports that case).
 */
function isBreakInsideDay(opensAt: string, breakStart: string, breakEnd: string, closesAt: string): boolean | null {
  const o = minutesOf(opensAt);
  const bs = minutesOf(breakStart);
  const be = minutesOf(breakEnd);
  const c = minutesOf(closesAt);
  if (o === null || bs === null || be === null || c === null) return null;
  const sinceOpening = (t: number) => (t - o + 24 * 60) % (24 * 60);
  return 0 < sinceOpening(bs) && sinceOpening(bs) < sinceOpening(be) && sinceOpening(be) < sinceOpening(c);
}

/** One open day → its sessions: one without a break, two (before and after) with one. */
function sessionsForDay(h: OperationsDay): { dayOfWeek: DayOfWeek; opensAt: string; closesAt: string }[] {
  const dayOfWeek = WEEKDAY_INDEX[h.day];
  const opensAt = normalizeTime(h.opensAt);
  const closesAt = normalizeTime(h.closesAt);
  if (!h.hasBreak) return [{ dayOfWeek, opensAt, closesAt }];
  return [
    { dayOfWeek, opensAt, closesAt: normalizeTime(h.breakStart ?? '') },
    { dayOfWeek, opensAt: normalizeTime(h.breakEnd ?? ''), closesAt },
  ];
}

/** Accepts "9:30", "0930" or "930" (number pads often have no colon) → "09:30". */
export function normalizeTime(text: string): string {
  const trimmed = text.trim();
  const match = /^(\d{1,2}):?(\d{2})$/.exec(trimmed);
  return match ? `${match[1]!.padStart(2, '0')}:${match[2]}` : trimmed;
}

/**
 * Validates the Operations step and builds the two request bodies it sends:
 * `PUT …/hours` and `PATCH …/branch`. Nothing is sent unless both are valid.
 */
export function buildOperationsPayload(form: OperationsForm): OperationsResult {
  const errors: Extract<OperationsResult, { ok: false }>['errors'] = {};

  const openDays = form.hours.filter((h) => h.isOpen);
  const sessions = openDays.flatMap(sessionsForDay);
  // Check each break's order first: the weekly check would only report it as an overlap.
  const badBreak = openDays.find(
    (h) =>
      h.hasBreak &&
      isBreakInsideDay(
        normalizeTime(h.opensAt),
        normalizeTime(h.breakStart ?? ''),
        normalizeTime(h.breakEnd ?? ''),
        normalizeTime(h.closesAt),
      ) === false,
  );
  const issue = badBreak ? null : validateWeeklyHours(sessions);
  if (badBreak) {
    errors.hours = `${badBreak.label}: ${BREAK_ORDER_MESSAGE}`;
  } else if (issue) {
    const day = 'dayOfWeek' in issue ? form.hours.find((h) => WEEKDAY_INDEX[h.day] === issue.dayOfWeek) : undefined;
    errors.hours = `${day ? `${day.label}: ` : ''}${HOURS_MESSAGES[issue.code]}`;
  }

  const minimumOrderMinor = form.minOrderAmount.trim() === '' ? 0 : rupeesToPaise(form.minOrderAmount);
  if (minimumOrderMinor === null) {
    errors.minOrderAmount = 'Enter an amount in rupees, like 150 or 149.50.';
  }

  const branch = { avgPrepMinutes: form.avgPrepMinutes, minimumOrderMinor: minimumOrderMinor ?? 0 };
  const branchCheck = UpdateBranchSchema.safeParse(branch);
  if (!branchCheck.success) {
    for (const issue of branchCheck.error.issues) {
      if (issue.path[0] === 'avgPrepMinutes') errors.avgPrepMinutes ??= 'Choose an average prep time.';
      if (issue.path[0] === 'minimumOrderMinor') errors.minOrderAmount ??= 'That minimum order amount is too large.';
    }
  }
  if (!errors.hours && !ReplaceHoursSchema.safeParse({ sessions }).success) {
    errors.hours = 'Too many opening sessions.';
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, payload: { hours: { sessions }, branch } };
}

/**
 * Turns saved sessions (`GET …/hours`) back into the form's days, so a resumed registration
 * shows what was saved. A day with two or more sessions becomes opening → break → closing,
 * using the first gap as the break. Days without sessions are marked closed.
 */
export function daysFromSessions<D extends OperationsDay>(days: D[], sessions: HoursSession[]): D[] {
  return days.map((d) => {
    const own = sessions
      .filter((s) => s.dayOfWeek === WEEKDAY_INDEX[d.day])
      .sort((a, b) => (minutesOf(a.opensAt) ?? 0) - (minutesOf(b.opensAt) ?? 0));
    const first = own[0];
    const last = own[own.length - 1];
    if (!first || !last) return { ...d, isOpen: false, hasBreak: false };
    const second = own[1];
    return {
      ...d,
      isOpen: true,
      opensAt: first.opensAt,
      closesAt: last.closesAt,
      hasBreak: second !== undefined,
      breakStart: second ? first.closesAt : (d.breakStart ?? ''),
      breakEnd: second ? second.opensAt : (d.breakEnd ?? ''),
    };
  });
}

/**
 * Continue on the Operations step: validates, then saves hours and branch settings.
 * Returns the validation result; the caller advances only when `ok` is true.
 */
export async function saveOperations(
  api: Pick<ApiClient, 'request'>,
  branchId: string,
  form: OperationsForm,
): Promise<OperationsResult> {
  const result = buildOperationsPayload(form);
  if (!result.ok) return result;
  await api.request('PUT', paths.partner.hours(branchId), {
    schema: HoursResponseSchema,
    body: result.payload.hours,
  });
  await api.request('PATCH', paths.partner.branch(branchId), {
    schema: BranchDetailSchema,
    body: result.payload.branch,
  });
  return result;
}
