import type { StaffUser } from '@hungerly/types';

import { useOnboardingStore, type RegistrationDraft } from './draft';
import { formatDayHours, reviewSections } from './review';
import { stepByKey, stepNumber } from './steps';
import { validDraft } from './testFixtures';

const valueOf = (draft: RegistrationDraft, section: string, label: string) =>
  reviewSections(draft)
    .find((s) => s.section === section)
    ?.rows.find((r) => r.label === label)?.value;

describe('review sections', () => {
  it('shows every collected value, grouped by section', () => {
    const sections = reviewSections(validDraft());
    expect(sections.map((s) => s.title)).toEqual([
      'Restaurant',
      'Owner or manager',
      'Address',
      'Contact',
      'Operations',
    ]);
    const values = sections.flatMap((s) => s.rows.map((r) => r.value));
    for (const expected of [
      'Spice Garden',
      'North Indian, Biryani',
      'Mixed',
      'Rohan Mehta',
      'Owner',
      '12 MG Road',
      'Camp',
      'Pune',
      'Maharashtra',
      '411001',
      '+91 98123 45678',
      'hello@spicegarden.example',
      '11:00 am – 11:00 pm',
      '20 min',
      '₹199',
    ]) {
      expect(values).toContain(expected);
    }
  });

  it('lists all seven days, including closed days and late nights', () => {
    const draft = validDraft();
    draft.operations.hours = draft.operations.hours.map((d) =>
      d.dayOfWeek === 4
        ? { ...d, opensAt: '18:00', closesAt: '01:00' }
        : d.dayOfWeek === 0
          ? { ...d, isOpen: false }
          : d,
    );
    const operations = reviewSections(draft).find((s) => s.section === 'operations');
    expect(operations?.rows.slice(0, 7).map((r) => r.label)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    expect(valueOf(draft, 'operations', 'Monday')).toBe('Closed');
    expect(valueOf(draft, 'operations', 'Friday')).toBe('6:00 pm – 1:00 am (next day)');
  });

  it('marks missing optional values instead of leaving gaps', () => {
    const draft = validDraft();
    draft.contact.email = '';
    expect(valueOf(draft, 'contact', 'Email')).toBe('Not provided');
  });

  it('sends each Edit action to its step', () => {
    const editHref = (section: string) =>
      reviewSections(validDraft()).find((s) => s.section === section)?.editHref;
    expect(editHref('restaurant')).toBe(stepByKey('restaurant').href);
    expect(editHref('owner')).toBe(stepByKey('owner').href);
    expect(editHref('address')).toBe(stepByKey('address').href);
    expect(editHref('contact')).toBe(stepByKey('contact').href);
    expect(editHref('operations')).toBe(stepByKey('operations').href);
    expect([1, 2, 3, 4, 5]).toEqual(
      (['restaurant', 'owner', 'address', 'contact', 'operations'] as const).map(stepNumber),
    );
  });

  it('shows edited values when returning to review, leaving other sections unchanged', () => {
    const user: StaffUser = {
      id: 'usr-7',
      fullName: null,
      phoneE164: '+919812345678',
      email: null,
    };
    const store = useOnboardingStore.getState;
    store().reset();
    store().start(user);
    const draft = validDraft();
    for (const section of ['restaurant', 'owner', 'address', 'contact', 'operations'] as const) {
      store().update(section, draft[section]);
    }
    const before = reviewSections(store().draft);

    // Review → Edit Restaurant → change name → back to Review.
    store().update('restaurant', { name: 'Spice Garden Kitchen' });
    // Review → Edit Operations → change minimum order → back to Review.
    store().update('operations', { minimumOrder: '249' });

    const after = reviewSections(store().draft);
    expect(valueOf(store().draft, 'restaurant', 'Name')).toBe('Spice Garden Kitchen');
    expect(valueOf(store().draft, 'operations', 'Minimum order')).toBe('₹249');
    for (const section of ['owner', 'address', 'contact'] as const) {
      expect(after.find((s) => s.section === section)).toEqual(
        before.find((s) => s.section === section),
      );
    }
  });
});

describe('formatDayHours', () => {
  it('formats open, closed and overnight days', () => {
    const day = { dayOfWeek: 0 as const, isOpen: true, opensAt: '11:30', closesAt: '15:30' };
    expect(formatDayHours(day)).toBe('11:30 am – 3:30 pm');
    expect(formatDayHours({ ...day, isOpen: false })).toBe('Closed');
    expect(formatDayHours({ ...day, opensAt: '19:00', closesAt: '00:30' })).toBe(
      '7:00 pm – 12:30 am (next day)',
    );
  });
});
