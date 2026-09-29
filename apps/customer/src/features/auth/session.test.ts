import type { Session } from '@hungerly/types';

import { entryRouteFor } from './session';

const session = (fullName: string | null, isNewUser: boolean): Session => ({
  user: { id: 'u', phoneE164: '+919876543210', fullName, email: null },
  isNewUser,
});

describe('entryRouteFor', () => {
  it('shows onboarding to first-time visitors and login afterwards', () => {
    expect(entryRouteFor({ session: null, hasSeenOnboarding: false })).toBe('/onboarding');
    expect(entryRouteFor({ session: null, hasSeenOnboarding: true })).toBe('/login');
  });

  it('asks new users without a name to set up their profile', () => {
    expect(entryRouteFor({ session: session(null, true), hasSeenOnboarding: true })).toBe(
      '/profile-setup',
    );
  });

  it('sends returning or named users straight home', () => {
    expect(entryRouteFor({ session: session(null, false), hasSeenOnboarding: true })).toBe('/home');
    expect(entryRouteFor({ session: session('Aarav', true), hasSeenOnboarding: true })).toBe(
      '/home',
    );
  });
});
