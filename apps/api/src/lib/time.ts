import { IST_UTC_OFFSET_MINUTES } from '@hungerly/utils';

/** Injectable clock so tests can control "now" (schedules, holds, expiry). */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

/** Local (India) calendar date "YYYY-MM-DD" for an instant. */
export function istDate(at: Date): string {
  return new Date(at.getTime() + IST_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** UTC instant of local midnight at the start of an IST date. */
export function istMidnight(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - IST_UTC_OFFSET_MINUTES * 60_000);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
