import { createApiClient } from '@hungerly/api-client';

import { mockFetch } from '@/lib/mockFetch';

import {
  buildOperationsPayload,
  daysFromSessions,
  normalizeTime,
  saveOperations,
  type OperationsDay,
  type OperationsForm,
} from './operations';

const DAYS: [OperationsDay['day'], string][] = [
  ['monday', 'Monday'],
  ['tuesday', 'Tuesday'],
  ['wednesday', 'Wednesday'],
  ['thursday', 'Thursday'],
  ['friday', 'Friday'],
  ['saturday', 'Saturday'],
  ['sunday', 'Sunday'],
];

/** The screen's defaults: open 11:00–23:00 every day except Sunday. */
function form(overrides: Partial<OperationsForm> = {}): OperationsForm {
  return {
    hours: DAYS.map(([day, label]) => ({ day, label, isOpen: day !== 'sunday', opensAt: '11:00', closesAt: '23:00' })),
    avgPrepMinutes: 20,
    minOrderAmount: '',
    ...overrides,
  };
}

function withDay(day: OperationsDay['day'], patch: Partial<OperationsDay>): OperationsDay[] {
  return form().hours.map((h) => (h.day === day ? { ...h, ...patch } : h));
}

describe('buildOperationsPayload', () => {
  it('builds both request bodies for valid input, with ISO weekdays (0 = Monday)', () => {
    const result = buildOperationsPayload(form({ minOrderAmount: '149.50', avgPrepMinutes: 25 }));
    expect(result).toEqual({
      ok: true,
      payload: {
        hours: {
          sessions: [0, 1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, opensAt: '11:00', closesAt: '23:00' })),
        },
        branch: { avgPrepMinutes: 25, minimumOrderMinor: 14950 },
      },
    });
  });

  it('sends Sunday as 6', () => {
    const result = buildOperationsPayload(form({ hours: withDay('sunday', { isOpen: true }) }));
    expect(result.ok && result.payload.hours.sessions.at(-1)?.dayOfWeek).toBe(6);
  });

  it.each(['', '   '])('treats a blank minimum order (%j) as no minimum', (minOrderAmount) => {
    const result = buildOperationsPayload(form({ minOrderAmount }));
    expect(result.ok && result.payload.branch.minimumOrderMinor).toBe(0);
  });

  it('accepts typed rupee formats', () => {
    const result = buildOperationsPayload(form({ minOrderAmount: '₹1,200' }));
    expect(result.ok && result.payload.branch.minimumOrderMinor).toBe(120000);
  });

  it.each(['abc', '-50', '12.345', '1.2.3'])('rejects an invalid minimum order %j without sending NaN', (minOrderAmount) => {
    expect(buildOperationsPayload(form({ minOrderAmount }))).toEqual({
      ok: false,
      errors: { minOrderAmount: 'Enter an amount in rupees, like 150 or 149.50.' },
    });
  });

  it('rejects an amount over the API limit', () => {
    const result = buildOperationsPayload(form({ minOrderAmount: '99999999' }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.minOrderAmount).toBe('That minimum order amount is too large.');
  });

  it('requires at least one open day', () => {
    const closed = form().hours.map((h) => ({ ...h, isOpen: false }));
    expect(buildOperationsPayload(form({ hours: closed }))).toEqual({
      ok: false,
      errors: { hours: 'Open on at least one day.' },
    });
  });

  it('names the day with an invalid time', () => {
    const result = buildOperationsPayload(form({ hours: withDay('wednesday', { closesAt: '25:00' }) }));
    expect(!result.ok && result.errors.hours).toBe('Wednesday: Use 24-hour times like 09:30 or 23:00.');
  });

  it('rejects the same opening and closing time', () => {
    const result = buildOperationsPayload(form({ hours: withDay('monday', { closesAt: '11:00' }) }));
    expect(!result.ok && result.errors.hours).toBe('Monday: Opening and closing times must be different.');
  });

  it('rejects a late close that runs into the next day’s opening', () => {
    const result = buildOperationsPayload(form({ hours: withDay('monday', { closesAt: '12:00', opensAt: '13:00' }) }));
    expect(!result.ok && result.errors.hours).toBe('Monday: Two days overlap. Close before the next day opens.');
  });

  it('rejects a prep time outside the API range', () => {
    const result = buildOperationsPayload(form({ avgPrepMinutes: 0 }));
    expect(!result.ok && result.errors.avgPrepMinutes).toBe('Choose an average prep time.');
  });

  it('ignores times on closed days', () => {
    const result = buildOperationsPayload(form({ hours: withDay('sunday', { isOpen: false, opensAt: 'xx' }) }));
    expect(result.ok).toBe(true);
  });
});

describe('break times', () => {
  const sessionsFor = (result: ReturnType<typeof buildOperationsPayload>, dayOfWeek: number) =>
    result.ok ? result.payload.hours.sessions.filter((x) => x.dayOfWeek === dayOfWeek) : [];

  it('saves a day with a break as two sessions: opening–break start and break end–closing', () => {
    const result = buildOperationsPayload(
      form({ hours: withDay('monday', { hasBreak: true, breakStart: '15:00', breakEnd: '17:00' }) }),
    );
    expect(result.ok).toBe(true);
    expect(sessionsFor(result, 0)).toEqual([
      { dayOfWeek: 0, opensAt: '11:00', closesAt: '15:00' },
      { dayOfWeek: 0, opensAt: '17:00', closesAt: '23:00' },
    ]);
    // Other days keep a single session.
    expect(sessionsFor(result, 1)).toEqual([{ dayOfWeek: 1, opensAt: '11:00', closesAt: '23:00' }]);
  });

  it('ignores the break times when the break is switched off', () => {
    const result = buildOperationsPayload(
      form({ hours: withDay('monday', { hasBreak: false, breakStart: 'xx', breakEnd: '' }) }),
    );
    expect(sessionsFor(result, 0)).toEqual([{ dayOfWeek: 0, opensAt: '11:00', closesAt: '23:00' }]);
  });

  it('accepts number-pad times for the break', () => {
    const result = buildOperationsPayload(
      form({ hours: withDay('monday', { hasBreak: true, breakStart: '1500', breakEnd: '1730' }) }),
    );
    expect(sessionsFor(result, 0)[1]).toEqual({ dayOfWeek: 0, opensAt: '17:30', closesAt: '23:00' });
  });

  it('allows a break on a day that closes after midnight', () => {
    const result = buildOperationsPayload(
      form({ hours: withDay('friday', { opensAt: '18:00', closesAt: '02:00', hasBreak: true, breakStart: '22:00', breakEnd: '22:30' }) }),
    );
    expect(result.ok).toBe(true);
    expect(sessionsFor(result, 4)).toEqual([
      { dayOfWeek: 4, opensAt: '18:00', closesAt: '22:00' },
      { dayOfWeek: 4, opensAt: '22:30', closesAt: '02:00' },
    ]);
  });

  it.each([
    ['starts before opening', '10:00', '12:00'],
    ['ends after closing', '22:00', '23:30'],
    ['ends before it starts', '17:00', '15:00'],
    ['has no length', '15:00', '15:00'],
    ['starts exactly at opening', '11:00', '12:00'],
  ])('rejects a break that %s', (_label, breakStart, breakEnd) => {
    const result = buildOperationsPayload(
      form({ hours: withDay('tuesday', { hasBreak: true, breakStart, breakEnd }) }),
    );
    expect(!result.ok && result.errors.hours).toBe(
      'Tuesday: The break must start after opening and end before closing.',
    );
  });

  it('reports a malformed break time as an invalid time', () => {
    const result = buildOperationsPayload(
      form({ hours: withDay('monday', { hasBreak: true, breakStart: '25:00', breakEnd: '17:00' }) }),
    );
    expect(!result.ok && result.errors.hours).toBe('Monday: Use 24-hour times like 09:30 or 23:00.');
  });
});

describe('daysFromSessions (restoring saved hours)', () => {
  const blank = form().hours.map((h) => ({ ...h, hasBreak: false, breakStart: '15:00', breakEnd: '17:00' }));

  it('restores a day with two sessions as opening, break and closing', () => {
    const days = daysFromSessions(blank, [
      { dayOfWeek: 0, opensAt: '17:00', closesAt: '23:00' },
      { dayOfWeek: 0, opensAt: '11:00', closesAt: '15:30' },
    ]);
    expect(days[0]).toMatchObject({ isOpen: true, opensAt: '11:00', closesAt: '23:00', hasBreak: true, breakStart: '15:30', breakEnd: '17:00' });
  });

  it('restores a single session as a day without a break, and missing days as closed', () => {
    const days = daysFromSessions(blank, [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '21:00' }]);
    expect(days[1]).toMatchObject({ isOpen: true, opensAt: '09:00', closesAt: '21:00', hasBreak: false });
    expect(days[0]).toMatchObject({ isOpen: false, hasBreak: false });
  });

  it('round-trips: what is saved is what the form shows again', () => {
    const entered = blank.map((h) =>
      h.day === 'wednesday' ? { ...h, hasBreak: true, breakStart: '14:30', breakEnd: '16:00' } : h,
    );
    const saved = buildOperationsPayload(form({ hours: entered }));
    if (!saved.ok) throw new Error('expected a valid form');
    const restored = daysFromSessions(blank, saved.payload.hours.sessions);
    expect(restored).toEqual(entered);
  });
});

describe('normalizeTime', () => {
  it.each([
    ['9:30', '09:30'],
    ['0930', '09:30'],
    ['930', '09:30'],
    [' 23:00 ', '23:00'],
    ['abc', 'abc'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeTime(input)).toBe(expected);
  });
});

describe('saveOperations (Continue on the Operations step, mock API)', () => {
  const api = createApiClient({ baseUrl: 'http://prototype.swaadone.invalid/api/v1', fetchImpl: mockFetch });
  const branchId = '00000000-0000-4007-8000-000000000001';

  it.each([
    ['with a minimum order', '150'],
    ['with a blank minimum order', ''],
  ])('saves and lets the wizard advance %s', async (_label, minOrderAmount) => {
    const onNext = jest.fn();
    const result = await saveOperations(api, branchId, form({ minOrderAmount }));
    if (result.ok) onNext();
    expect(result.ok).toBe(true);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('saves a schedule with breaks through the hours API and gets the sessions back', async () => {
    const hours = withDay('monday', { hasBreak: true, breakStart: '15:00', breakEnd: '17:00' });
    const result = await saveOperations(api, branchId, form({ hours }));
    expect(result.ok).toBe(true);
    expect(result.ok && result.payload.hours.sessions.filter((x) => x.dayOfWeek === 0)).toHaveLength(2);
  });

  it('sends nothing and does not advance when the form is invalid', async () => {
    const request = jest.fn();
    const result = await saveOperations({ request }, branchId, form({ minOrderAmount: 'abc' }));
    expect(result.ok).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});
