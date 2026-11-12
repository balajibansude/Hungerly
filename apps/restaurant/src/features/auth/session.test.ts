import type { PartnerSession } from '@hungerly/api-client';

import { activeBranch, entryRouteFor, resumableBranch, routeAccessFor } from './session';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const user = { id: '00000000-0000-4000-8000-000000000001', fullName: 'Asha', phoneE164: '+919876543210', email: null };
const business = { id: '00000000-0000-4000-8000-000000000002', displayName: 'Asha Foods', legalName: 'Asha Foods LLP', entityType: 'llp' as const, gstin: null };
type Status = PartnerSession['branches'][number]['status'];
const branch = (id: string, name: string, status: Status = 'active') => ({ id, name, locality: 'Indiranagar', city: 'Bengaluru', status, role: 'owner' as const });
const ownerWith = (...statuses: Status[]): PartnerSession => ({
  user,
  business,
  branches: statuses.map((status, i) => branch(`00000000-0000-4000-8000-0000000000b${i}`, `Branch ${i}`, status)),
});

const newOwner: PartnerSession = { user, business: null, branches: [] };
const twoBranches: PartnerSession = {
  user,
  business,
  branches: [branch('00000000-0000-4000-8000-0000000000a1', 'Koramangala'), branch('00000000-0000-4000-8000-0000000000a2', 'Indiranagar')],
};

describe('route access', () => {
  it('signed-out users only reach login', () => {
    expect(routeAccessFor(null)).toEqual({ signedOut: true, needsOnboarding: false, awaitingApproval: false, hasWorkspace: false });
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

describe('route access by branch status', () => {
  it('a draft branch keeps the owner in registration', () => {
    const access = routeAccessFor(ownerWith('draft'));
    expect(access).toEqual({ signedOut: false, needsOnboarding: true, awaitingApproval: false, hasWorkspace: false });
    expect(entryRouteFor(ownerWith('draft'))).toBe('/welcome');
  });

  it('a rejected branch sends the owner back to registration to fix and resubmit', () => {
    expect(routeAccessFor(ownerWith('rejected')).needsOnboarding).toBe(true);
    expect(entryRouteFor(ownerWith('rejected'))).toBe('/welcome');
  });

  it('a branch in review shows the pending approval screen, not the dashboard', () => {
    const access = routeAccessFor(ownerWith('pending_review'));
    expect(access).toEqual({ signedOut: false, needsOnboarding: false, awaitingApproval: true, hasWorkspace: false });
    expect(entryRouteFor(ownerWith('pending_review'))).toBe('/pending');
  });

  it('an active branch opens the dashboard', () => {
    const access = routeAccessFor(ownerWith('active'));
    expect(access).toEqual({ signedOut: false, needsOnboarding: false, awaitingApproval: false, hasWorkspace: true });
    expect(entryRouteFor(ownerWith('active'))).toBe('/home');
  });

  it('a once-approved branch (suspended or closed) still opens the dashboard', () => {
    expect(entryRouteFor(ownerWith('suspended'))).toBe('/home');
    expect(entryRouteFor(ownerWith('closed'))).toBe('/home');
  });

  it('an approved owner adding another branch stays in the dashboard', () => {
    expect(entryRouteFor(ownerWith('active', 'draft'))).toBe('/home');
    expect(entryRouteFor(ownerWith('pending_review', 'active'))).toBe('/home');
  });

  it('a submitted branch takes priority over a stray draft before the first approval', () => {
    expect(entryRouteFor(ownerWith('draft', 'pending_review'))).toBe('/pending');
  });

  it('exactly one route group is reachable for every status', () => {
    for (const status of ['draft', 'rejected', 'pending_review', 'active', 'suspended', 'closed'] as const) {
      const { signedOut, needsOnboarding, awaitingApproval, hasWorkspace } = routeAccessFor(ownerWith(status));
      expect([signedOut, needsOnboarding, awaitingApproval, hasWorkspace].filter(Boolean)).toHaveLength(1);
    }
  });
});

describe('resumableBranch', () => {
  it('returns the existing draft branch so registration does not create a duplicate', () => {
    expect(resumableBranch(ownerWith('draft'))?.id).toBe('00000000-0000-4000-8000-0000000000b0');
  });

  it('returns a rejected branch so it can be corrected and resubmitted', () => {
    expect(resumableBranch(ownerWith('rejected'))?.status).toBe('rejected');
  });

  it('returns null when there is nothing to resume', () => {
    expect(resumableBranch(null)).toBeNull();
    expect(resumableBranch(newOwner)).toBeNull();
    expect(resumableBranch(ownerWith('pending_review'))).toBeNull();
    expect(resumableBranch(ownerWith('active'))).toBeNull();
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
