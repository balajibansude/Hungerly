import type { OpeningHoursSlot } from '@hungerly/types';

import { evaluateAvailability, type AvailabilityInput } from './availability';

// 2026-10-12 is a Monday (dayOfWeek 0). IST = UTC+05:30.
const ist = (local: string) => new Date(`${local}+05:30`);

const split: OpeningHoursSlot[] = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
  { dayOfWeek: day as OpeningHoursSlot['dayOfWeek'], opensAt: '08:00', closesAt: '16:00' },
  { dayOfWeek: day as OpeningHoursSlot['dayOfWeek'], opensAt: '17:00', closesAt: '23:00' },
]);

const base: AvailabilityInput = {
  status: 'active',
  isAcceptingOrders: true,
  pausedUntil: null,
  sessions: split,
  closedDates: [],
};

describe('evaluateAvailability', () => {
  it('is open inside a session and reports when it closes', () => {
    const result = evaluateAvailability(base, ist('2026-10-12T12:00:00'));
    expect(result.state).toBe('open');
    expect(result.acceptingOrders).toBe(true);
    expect(result.closesAt?.toISOString()).toBe(ist('2026-10-12T16:00:00').toISOString());
  });

  it('is on a break between two sessions of the same day', () => {
    const result = evaluateAvailability(base, ist('2026-10-12T16:30:00'));
    expect(result.state).toBe('on_break');
    expect(result.acceptingOrders).toBe(false);
    expect(result.nextOpenAt?.toISOString()).toBe(ist('2026-10-12T17:00:00').toISOString());
  });

  it('is closed for the day after the last session', () => {
    const result = evaluateAvailability(base, ist('2026-10-12T23:30:00'));
    expect(result.state).toBe('closed_for_day');
    expect(result.nextOpenAt?.toISOString()).toBe(ist('2026-10-13T08:00:00').toISOString());
  });

  it('is not open yet before the first session', () => {
    expect(evaluateAvailability(base, ist('2026-10-12T07:00:00')).state).toBe('not_open_yet');
  });

  it('closes at the exact closing minute', () => {
    expect(evaluateAvailability(base, ist('2026-10-12T15:59:00')).state).toBe('open');
    expect(evaluateAvailability(base, ist('2026-10-12T16:00:00')).state).toBe('on_break');
  });

  it('handles sessions that cross midnight', () => {
    const late: AvailabilityInput = { ...base, sessions: [{ dayOfWeek: 4, opensAt: '18:00', closesAt: '02:00' }] };
    // Friday 18:00 → Saturday 02:00 (2026-10-16 is a Friday).
    expect(evaluateAvailability(late, ist('2026-10-17T01:30:00')).state).toBe('open');
    expect(evaluateAvailability(late, ist('2026-10-17T02:30:00')).acceptingOrders).toBe(false);
  });

  it('honours holidays, pauses, the online switch and lifecycle status, in that order of precedence', () => {
    const noon = ist('2026-10-12T12:00:00');
    expect(evaluateAvailability({ ...base, closedDates: ['2026-10-12'] }, noon).state).toBe('holiday');
    expect(evaluateAvailability({ ...base, pausedUntil: ist('2026-10-12T12:30:00') }, noon).state).toBe('paused');
    expect(evaluateAvailability({ ...base, pausedUntil: ist('2026-10-12T11:30:00') }, noon).state).toBe('open');
    expect(evaluateAvailability({ ...base, isAcceptingOrders: false }, noon).state).toBe('offline');
    expect(evaluateAvailability({ ...base, status: 'pending_review' }, noon).state).toBe('not_active');
    expect(evaluateAvailability({ ...base, status: 'suspended', closedDates: ['2026-10-12'] }, noon).state).toBe('not_active');
  });

  it('skips a holiday when computing the next opening', () => {
    const result = evaluateAvailability({ ...base, closedDates: ['2026-10-13'] }, ist('2026-10-12T23:30:00'));
    expect(result.nextOpenAt?.toISOString()).toBe(ist('2026-10-14T08:00:00').toISOString());
  });

  it('returns no next opening when there are no sessions', () => {
    const result = evaluateAvailability({ ...base, sessions: [] }, ist('2026-10-12T12:00:00'));
    expect(result.state).toBe('closed_for_day');
    expect(result.nextOpenAt).toBeNull();
  });
});
