import type { PartnerSession } from '@hungerly/types';

import { activeMembership, entryRouteFor, routeAccessFor, useSessionStore } from './session';

const user = { id: 'u', fullName: null, phoneE164: '+919812345678', email: null };
const newOwner: PartnerSession = { user, memberships: [] };
const owner: PartnerSession = {
  user,
  memberships: [
    { restaurantId: 'r1', restaurantName: 'Masala Junction', role: 'owner' },
    { restaurantId: 'r2', restaurantName: 'Second Kitchen', role: 'manager' },
  ],
};

describe('entryRouteFor', () => {
  it('sends signed-out users to login', () => {
    expect(entryRouteFor(null)).toBe('/login');
  });

  it('sends users without a restaurant into onboarding', () => {
    expect(entryRouteFor(newOwner)).toBe('/welcome');
  });

  it('sends restaurant staff to the dashboard', () => {
    expect(entryRouteFor(owner)).toBe('/dashboard');
  });
});

describe('routeAccessFor', () => {
  it('opens exactly one route group for each session state', () => {
    for (const session of [null, newOwner, owner]) {
      const access = routeAccessFor(session);
      const open = [access.signedOut, access.needsOnboarding, access.hasRestaurant];
      expect(open.filter(Boolean)).toHaveLength(1);
    }
  });

  it('matches the entry route', () => {
    expect(routeAccessFor(null).signedOut).toBe(true);
    expect(routeAccessFor(newOwner).needsOnboarding).toBe(true);
    expect(routeAccessFor(owner).hasRestaurant).toBe(true);
  });
});

describe('activeMembership', () => {
  it('uses the first restaurant until a picker exists', () => {
    expect(activeMembership(owner)?.restaurantId).toBe('r1');
    expect(activeMembership(newOwner)).toBeNull();
    expect(activeMembership(null)).toBeNull();
  });
});

describe('session store', () => {
  it('restores, signs in and signs out', () => {
    const store = useSessionStore;
    expect(store.getState().isRestored).toBe(false);
    store.getState().markRestored(null);
    expect(store.getState().isRestored).toBe(true);
    store.getState().signIn(owner);
    expect(store.getState().session).toBe(owner);
    store.getState().signOut();
    expect(store.getState().session).toBeNull();
    expect(store.getState().isRestored).toBe(true);
  });
});
