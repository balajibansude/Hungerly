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

describe('routing around registration', () => {
  const registered: PartnerSession = {
    user,
    memberships: [{ restaurantId: 'rst-9', restaurantName: 'Spice Garden', role: 'owner' }],
  };

  it('sends a new account without a restaurant into onboarding, even with a stale flag', () => {
    expect(entryRouteFor(newOwner)).toBe('/welcome');
    expect(entryRouteFor(newOwner, { registrationCompleted: true })).toBe('/welcome');
  });

  it('shows the completion screen once, then the workspace', () => {
    expect(entryRouteFor(registered, { registrationCompleted: true })).toBe(
      '/registration-complete',
    );
    expect(entryRouteFor(registered)).toBe('/dashboard');
  });

  it('still opens the existing demo restaurant directly', () => {
    expect(entryRouteFor(owner, { registrationCompleted: false })).toBe('/dashboard');
  });

  it('closes onboarding once the membership exists, so back cannot return to it', () => {
    expect(routeAccessFor(newOwner).needsOnboarding).toBe(true);
    expect(routeAccessFor(registered)).toEqual({
      signedOut: false,
      needsOnboarding: false,
      hasRestaurant: true,
    });
  });

  it('sends a signed-out user to login', () => {
    expect(entryRouteFor(null, { registrationCompleted: true })).toBe('/login');
  });
});
