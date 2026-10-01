import type { OpeningHoursSlot } from '@hungerly/types';

import { intakeStatusFor, roleLabel } from './status';

// 2026-10-02 is a Friday (ISO day 4).
const hours: OpeningHoursSlot[] = [{ dayOfWeek: 4, opensAt: '11:00', closesAt: '23:00' }];
const lunch = new Date('2026-10-02T13:00:00+05:30');
const lateNight = new Date('2026-10-02T23:30:00+05:30');

describe('intakeStatusFor', () => {
  it('reports accepting orders when active, online and open', () => {
    expect(
      intakeStatusFor({ status: 'active', isAcceptingOrders: true, hours }, lunch),
    ).toMatchObject({ label: 'Accepting orders', tone: 'success' });
  });

  it('reports offline before checking the hours', () => {
    expect(
      intakeStatusFor({ status: 'active', isAcceptingOrders: false, hours }, lateNight),
    ).toMatchObject({ label: 'Offline', tone: 'neutral' });
  });

  it('reports closed outside opening hours', () => {
    expect(
      intakeStatusFor({ status: 'active', isAcceptingOrders: true, hours }, lateNight),
    ).toMatchObject({ label: 'Closed now', tone: 'warning' });
  });

  it('explains a restaurant that is not active yet', () => {
    expect(
      intakeStatusFor({ status: 'pending_review', isAcceptingOrders: true, hours }, lunch),
    ).toMatchObject({ label: 'In review', tone: 'error' });
  });
});

describe('roleLabel', () => {
  it('names every staff role', () => {
    expect(roleLabel('owner')).toBe('Owner');
    expect(roleLabel('manager')).toBe('Manager');
    expect(roleLabel('staff')).toBe('Staff');
  });
});
