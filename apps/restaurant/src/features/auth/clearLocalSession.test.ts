import { useOnboardingStore } from '@/features/onboarding/draft';

import { clearLocalSession } from './clearLocalSession';
import { entryRouteFor, useSessionStore } from './session';

describe('clearLocalSession (log out)', () => {
  it('forgets the session and the registration draft, and routes to login', () => {
    const user = { id: 'usr-1', fullName: null, phoneE164: '+919812345678', email: null };
    useSessionStore.getState().signIn({ user, memberships: [] });
    useOnboardingStore.getState().start(user);
    useOnboardingStore.getState().update('restaurant', { name: 'Spice Garden' });

    clearLocalSession();

    expect(useSessionStore.getState().session).toBeNull();
    expect(useOnboardingStore.getState().ownerUserId).toBeNull();
    expect(useOnboardingStore.getState().draft.restaurant.name).toBe('');
    expect(entryRouteFor(useSessionStore.getState().session)).toBe('/login');
  });

  it('also drops a pending completion screen', () => {
    useOnboardingStore
      .getState()
      .submitSucceeded({ restaurantId: 'rst-9', restaurantName: 'Spice Garden' });
    clearLocalSession();
    expect(useOnboardingStore.getState().completed).toBeNull();
  });
});
