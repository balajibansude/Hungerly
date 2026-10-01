import { money } from '@hungerly/utils';

import { validateRegistration } from '@/services/registrationRules';

import type { RegistrationDraft } from './draft';
import { validDraft } from './testFixtures';
import { firstInvalidSection, hoursFromDraft, parseDraft, sectionErrors } from './validation';

/** A valid draft with one section patched. */
function draftWith<S extends keyof RegistrationDraft>(
  section: S,
  patch: Partial<RegistrationDraft[S]>,
): RegistrationDraft {
  const draft = validDraft();
  return { ...draft, [section]: { ...draft[section], ...patch } };
}

describe('restaurant details', () => {
  it('requires a name', () => {
    expect(sectionErrors(draftWith('restaurant', { name: '  ' }), 'restaurant').name).toBe(
      'Enter the restaurant name',
    );
    expect(sectionErrors(draftWith('restaurant', { name: 'A' }), 'restaurant').name).toMatch(
      /too short/,
    );
  });

  it('requires at least one cuisine', () => {
    expect(sectionErrors(draftWith('restaurant', { cuisines: [] }), 'restaurant').cuisines).toBe(
      'Choose at least one cuisine',
    );
  });

  it('requires a food type', () => {
    expect(sectionErrors(draftWith('restaurant', { foodType: null }), 'restaurant').foodType).toBe(
      'Choose veg only or mixed',
    );
  });
});

describe('owner', () => {
  it('requires a full name and a role', () => {
    const errors = sectionErrors(draftWith('owner', { fullName: '', role: null }), 'owner');
    expect(errors.fullName).toBe('Enter the full name');
    expect(errors.role).toBe('Choose owner or manager');
  });
});

describe('address', () => {
  it('requires every line', () => {
    const errors = sectionErrors(
      draftWith('address', { line1: '', locality: '', city: '', state: '' }),
      'address',
    );
    expect(Object.keys(errors).sort()).toEqual(['city', 'line1', 'locality', 'state']);
  });

  it('rejects invalid PIN codes', () => {
    for (const postalCode of ['4110', '011001', '41100A', '']) {
      expect(sectionErrors(draftWith('address', { postalCode }), 'address').postalCode).toBe(
        'Enter a valid 6-digit PIN code',
      );
    }
    expect(sectionErrors(draftWith('address', { postalCode: '411 001' }), 'address')).toEqual({});
  });
});

describe('contact', () => {
  it('rejects an invalid phone number', () => {
    for (const phone of ['', '12345', '5812345678']) {
      expect(sectionErrors(draftWith('contact', { phone }), 'contact').phone).toBe(
        'Enter a valid 10-digit mobile number',
      );
    }
  });

  it('rejects an invalid email but allows none', () => {
    expect(sectionErrors(draftWith('contact', { email: 'hello@' }), 'contact').email).toBe(
      'Enter a valid email address',
    );
    expect(sectionErrors(draftWith('contact', { email: '' }), 'contact')).toEqual({});
  });
});

describe('operations', () => {
  const hoursWith = (day: number, patch: object) =>
    validDraft().operations.hours.map((d) => (d.dayOfWeek === day ? { ...d, ...patch } : d));

  it('flags equal opening and closing times on that day', () => {
    const errors = sectionErrors(
      draftWith('operations', { hours: hoursWith(2, { opensAt: '10:00', closesAt: '10:00' }) }),
      'operations',
    );
    expect(errors['hours.2']).toBe('Opening and closing times can’t be the same');
  });

  it('flags a late night that runs into the next day’s opening', () => {
    const errors = sectionErrors(
      draftWith('operations', { hours: hoursWith(4, { opensAt: '18:00', closesAt: '12:00' }) }),
      'operations',
    );
    expect(errors['hours.4']).toBe('Friday’s hours overlap with Saturday’s');
  });

  it('accepts late nights that end before the next opening', () => {
    const draft = draftWith('operations', { hours: hoursWith(4, { closesAt: '01:00' }) });
    expect(sectionErrors(draft, 'operations')).toEqual({});
  });

  it('requires at least one open day', () => {
    const closed = validDraft().operations.hours.map((d) => ({ ...d, isOpen: false }));
    expect(sectionErrors(draftWith('operations', { hours: closed }), 'operations').hours).toBe(
      'Open on at least one day',
    );
  });

  it('only turns open days into opening-hours slots', () => {
    const hours = hoursWith(6, { isOpen: false });
    expect(hoursFromDraft(hours).map((s) => s.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('rejects a missing or out-of-range preparation time', () => {
    for (const avgPrepMinutes of [null, 0, 4, 121, 12.5]) {
      expect(
        sectionErrors(draftWith('operations', { avgPrepMinutes }), 'operations').avgPrepMinutes,
      ).toBe('Choose an average preparation time');
    }
  });

  it('rejects a missing, malformed or excessive minimum order', () => {
    const errorFor = (minimumOrder: string) =>
      sectionErrors(draftWith('operations', { minimumOrder }), 'operations').minimumOrder;
    expect(errorFor('')).toMatch(/₹0 for none/);
    expect(errorFor('abc')).toMatch(/like 149 or 149.50/);
    expect(errorFor('-5')).toMatch(/like 149 or 149.50/);
    expect(errorFor('12.345')).toMatch(/like 149 or 149.50/);
    expect(errorFor('1000001')).toMatch(/up to ₹1,00,000/);
    expect(errorFor('0')).toBeUndefined();
  });
});

describe('full draft', () => {
  it('turns a complete draft into a registration with money in paise', () => {
    const parsed = parseDraft(validDraft());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.registration).toMatchObject({
      name: 'Spice Garden',
      foodType: 'mixed',
      registrant: { fullName: 'Rohan Mehta', role: 'owner' },
      address: { postalCode: '411001', city: 'Pune' },
      phoneE164: '+919812345678',
      email: 'hello@spicegarden.example',
      avgPrepMinutes: 20,
      minimumOrder: money(19900),
    });
    expect(parsed.registration.hours).toHaveLength(7);
    expect(validateRegistration(parsed.registration)).toEqual([]);
  });

  it('stores no email when none is given', () => {
    const parsed = parseDraft(draftWith('contact', { email: '  ' }));
    expect(parsed.ok && parsed.registration.email).toBeNull();
  });

  it('points at the first invalid section in step order', () => {
    const draft = { ...draftWith('contact', { phone: '' }), owner: { fullName: '', role: null } };
    expect(firstInvalidSection(draft)).toBe('owner');
    const parsed = parseDraft(draft);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.section).toBe('owner');
    expect(parsed.errors.fullName).toBeDefined();
  });
});
