import type { StaffUser } from '@hungerly/types';

import { DEFAULT_PREP_MINUTES, draftFor, emptyDraft, useOnboardingStore } from './draft';

const phoneUser: StaffUser = {
  id: 'usr-1',
  fullName: null,
  phoneE164: '+919812345678',
  email: null,
};
const emailUser: StaffUser = {
  id: 'usr-2',
  fullName: 'Meera Iyer',
  phoneE164: null,
  email: 'meera@kitchen.example',
};

const store = () => useOnboardingStore.getState();

beforeEach(() => store().reset());

describe('initial draft', () => {
  it('starts empty, open every day 11:00–23:00, with the schema default prep time', () => {
    const draft = emptyDraft();
    expect(draft.restaurant).toEqual({ name: '', cuisines: [], foodType: null });
    expect(draft.owner).toEqual({ fullName: '', role: null });
    expect(draft.operations.hours).toHaveLength(7);
    expect(draft.operations.hours.every((d) => d.isOpen && d.opensAt === '11:00')).toBe(true);
    expect(draft.operations.avgPrepMinutes).toBe(DEFAULT_PREP_MINUTES);
    expect(draft.operations.minimumOrder).toBe('');
    expect(store().submission).toEqual({ status: 'idle' });
    expect(store().completed).toBeNull();
  });

  it('offers the sign-in phone and name as editable starting values', () => {
    expect(draftFor(phoneUser).contact).toEqual({ phone: '98123 45678', email: '' });
    expect(draftFor(phoneUser).owner.fullName).toBe('');
    expect(draftFor(emailUser).contact).toEqual({ phone: '', email: 'meera@kitchen.example' });
    expect(draftFor(emailUser).owner.fullName).toBe('Meera Iyer');
  });
});

describe('updating sections', () => {
  beforeEach(() => store().start(phoneUser));

  it('updates restaurant details', () => {
    store().update('restaurant', { name: 'Spice Garden', cuisines: ['Biryani'] });
    store().update('restaurant', { foodType: 'veg_only' });
    expect(store().draft.restaurant).toEqual({
      name: 'Spice Garden',
      cuisines: ['Biryani'],
      foodType: 'veg_only',
    });
  });

  it('updates owner details', () => {
    store().update('owner', { fullName: 'Rohan Mehta', role: 'manager' });
    expect(store().draft.owner).toEqual({ fullName: 'Rohan Mehta', role: 'manager' });
  });

  it('updates the address one field at a time', () => {
    store().update('address', { line1: '12 MG Road' });
    store().update('address', { postalCode: '411001' });
    expect(store().draft.address).toMatchObject({ line1: '12 MG Road', postalCode: '411001' });
  });

  it('updates contact details', () => {
    store().update('contact', { email: 'hello@spicegarden.example' });
    expect(store().draft.contact).toEqual({
      phone: '98123 45678',
      email: 'hello@spicegarden.example',
    });
  });

  it('updates operations, single days and all days', () => {
    store().update('operations', { avgPrepMinutes: 30, minimumOrder: '149' });
    store().setDayHours(4, { opensAt: '18:00', closesAt: '01:00' });
    store().setDayHours(6, { isOpen: false });
    const { operations } = store().draft;
    expect(operations.avgPrepMinutes).toBe(30);
    expect(operations.minimumOrder).toBe('149');
    expect(operations.hours[4]).toMatchObject({ opensAt: '18:00', closesAt: '01:00' });
    expect(operations.hours[6]?.isOpen).toBe(false);

    store().applyHoursToAllDays(4);
    expect(store().draft.operations.hours.every((d) => d.closesAt === '01:00' && d.isOpen)).toBe(
      true,
    );
  });

  it('keeps every other section when one changes (moving between steps)', () => {
    store().update('restaurant', { name: 'Spice Garden' });
    store().update('owner', { fullName: 'Rohan Mehta' });
    store().update('address', { city: 'Pune' });
    // Going back to step 1 and editing it again must not reset later steps.
    store().update('restaurant', { name: 'Spice Garden Kitchen' });
    expect(store().draft.owner.fullName).toBe('Rohan Mehta');
    expect(store().draft.address.city).toBe('Pune');
    expect(store().draft.contact.phone).toBe('98123 45678');
  });

  it('keeps invalid input as typed instead of discarding it', () => {
    store().update('address', { postalCode: '4110' });
    store().update('operations', { minimumOrder: '12.345' });
    expect(store().draft.address.postalCode).toBe('4110');
    expect(store().draft.operations.minimumOrder).toBe('12.345');
  });
});

describe('starting, resetting and finishing', () => {
  it('resumes the same person’s draft but starts clean for someone else', () => {
    store().start(phoneUser);
    store().update('restaurant', { name: 'Spice Garden' });
    const key = store().submissionKey;

    store().start(phoneUser);
    expect(store().draft.restaurant.name).toBe('Spice Garden');
    expect(store().submissionKey).toBe(key);

    store().start(emailUser);
    expect(store().draft.restaurant.name).toBe('');
    expect(store().draft.contact.email).toBe('meera@kitchen.example');
    expect(store().submissionKey).not.toBe(key);
  });

  it('reset clears the draft, its owner and any completion', () => {
    store().start(phoneUser);
    store().update('restaurant', { name: 'Spice Garden' });
    store().submitSucceeded({ restaurantId: 'rst-9', restaurantName: 'Spice Garden' });
    store().reset();
    expect(store().ownerUserId).toBeNull();
    expect(store().draft).toEqual(emptyDraft());
    expect(store().completed).toBeNull();
  });

  it('clears the draft after success and remembers what was completed', () => {
    store().start(phoneUser);
    store().update('restaurant', { name: 'Spice Garden' });
    const key = store().submissionKey;
    store().beginSubmit();
    store().submitSucceeded({ restaurantId: 'rst-9', restaurantName: 'Spice Garden' });
    expect(store().draft).toEqual(emptyDraft());
    expect(store().ownerUserId).toBeNull();
    expect(store().submissionKey).not.toBe(key);
    expect(store().submission).toEqual({ status: 'idle' });
    expect(store().completed).toEqual({ restaurantId: 'rst-9', restaurantName: 'Spice Garden' });

    store().acknowledgeCompletion();
    expect(store().completed).toBeNull();
  });

  it('clears a failure message as soon as the person edits again', () => {
    store().start(phoneUser);
    store().submitFailed('Network down.');
    store().update('owner', { fullName: 'Rohan' });
    expect(store().submission).toEqual({ status: 'idle' });
  });
});
