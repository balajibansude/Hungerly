import { isOpenAt, parseLocalTime } from '@hungerly/utils';

import { masalaJunction } from './restaurant';

/** An instant given as IST wall-clock time. 2026-10-02 is a Friday. */
const ist = (isoLocal: string) => new Date(`${isoLocal}+05:30`);

describe('Masala Junction mock data', () => {
  it('has well-formed opening hours for every day of the week', () => {
    const days = new Set(masalaJunction.hours.map((slot) => slot.dayOfWeek));
    expect(days.size).toBe(7);
    for (const slot of masalaJunction.hours) {
      expect(() => parseLocalTime(slot.opensAt)).not.toThrow();
      expect(() => parseLocalTime(slot.closesAt)).not.toThrow();
    }
  });

  it('is open for lunch and dinner, closed in between', () => {
    expect(isOpenAt(masalaJunction.hours, ist('2026-10-02T13:00:00'))).toBe(true);
    expect(isOpenAt(masalaJunction.hours, ist('2026-10-02T17:00:00'))).toBe(false);
    expect(isOpenAt(masalaJunction.hours, ist('2026-10-02T20:00:00'))).toBe(true);
  });

  it('serves past midnight only after Friday and Saturday dinner', () => {
    // Saturday 00:15 belongs to Friday's late slot; Friday 00:15 (after Thursday) is closed.
    expect(isOpenAt(masalaJunction.hours, ist('2026-10-03T00:15:00'))).toBe(true);
    expect(isOpenAt(masalaJunction.hours, ist('2026-10-02T00:15:00'))).toBe(false);
  });
});
