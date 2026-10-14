import type { PartnerSession } from '@hungerly/api-client';

import { activeBranch, entryRouteFor, routeAccessFor } from './session';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const user = { id: '00000000-0000-4000-8000-000000000001', fullName: 'Asha', phoneE164: '+919876543210', email: null };
const business = { id: '00000000-0000-4000-8000-000000000002', displayName: 'Asha Foods', legalName: 'Asha Foods LLP', entityType: 'llp' as const, gstin: null };
const branch = (id: string, name: string) => ({ id, name, locality: 'Indiranagar', city: 'Bengaluru', status: 'active' as const, role: 'owner' as const });

const newOwner: PartnerSession = { user, business: null, branches: [] };
const twoBranches: PartnerSession = {
  user,
  business,
  branches: [branch('00000000-0000-4000-8000-0000000000a1', 'Koramangala'), branch('00000000-0000-4000-8000-0000000000a2', 'Indiranagar')],
};

describe('route access', () => {
  it('signed-out users only reach login', () => {
    expect(routeAccessFor(null)).toEqual({ signedOut: true, needsOnboarding: false, hasWorkspace: false });
    expect(entryRouteFor(null)).toBe('/login');
  });

  it('an owner without branches goes to onboarding', () => {
    expect(routeAccessFor(newOwner).needsOnboarding).toBe(true);
    expect(entryRouteFor(newOwner)).toBe('/welcome');
  });

  it('an owner with branches reaches the workspace', () => {
    expect(routeAccessFor(twoBranches).hasWorkspace).toBe(true);
    expect(entryRouteFor(twoBranches)).toBe('/home');
  });
});

describe('activeBranch', () => {
  it('uses the selected branch when it belongs to the owner', () => {
    expect(activeBranch(twoBranches, '00000000-0000-4000-8000-0000000000a2')?.name).toBe('Indiranagar');
  });

  it('falls back to the first branch for an unknown or stale selection', () => {
    expect(activeBranch(twoBranches, 'someone-elses-branch')?.name).toBe('Koramangala');
    expect(activeBranch(newOwner, null)).toBeNull();
  });
});
