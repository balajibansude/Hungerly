import type { PartnerSession, RestaurantMembership } from '@hungerly/types';
import { create } from 'zustand';

/**
 * App session state. In-memory only for the prototype: signing in is repeated after the
 * app restarts. Secure token storage arrives with real authentication (docs/SECURITY.md).
 */
interface SessionState {
  /** True once the startup session check has finished (success or not). */
  isRestored: boolean;
  session: PartnerSession | null;
  markRestored: (session: PartnerSession | null) => void;
  signIn: (session: PartnerSession) => void;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  isRestored: false,
  session: null,
  markRestored: (session) => set({ isRestored: true, session }),
  signIn: (session) => set({ session }),
  signOut: () => set({ session: null }),
}));

/**
 * The restaurant the app is working on. Users with several restaurants will pick one
 * (R2, later); until then it is the first membership.
 */
export function activeMembership(session: PartnerSession | null): RestaurantMembership | null {
  return session?.memberships[0] ?? null;
}

export interface RouteAccess {
  /** Login and OTP screens. */
  signedOut: boolean;
  /** Signed in but works at no restaurant yet: register one. */
  needsOnboarding: boolean;
  /** Signed in with a restaurant: the restaurant workspace. */
  hasRestaurant: boolean;
}

/** Which route groups are reachable. Drives the `Stack.Protected` guards (UX only). */
export function routeAccessFor(session: PartnerSession | null): RouteAccess {
  const hasRestaurant = activeMembership(session) !== null;
  return {
    signedOut: session === null,
    needsOnboarding: session !== null && !hasRestaurant,
    hasRestaurant,
  };
}

export type EntryRoute = '/login' | '/welcome' | '/registration-complete' | '/dashboard';

export interface EntryOptions {
  /** A registration just succeeded and its completion screen has not been dismissed. */
  registrationCompleted?: boolean;
}

/** Where the app should go for the current session. Pure, so it is easy to test. */
export function entryRouteFor(
  session: PartnerSession | null,
  { registrationCompleted = false }: EntryOptions = {},
): EntryRoute {
  const access = routeAccessFor(session);
  if (access.signedOut) return '/login';
  if (access.needsOnboarding) return '/welcome';
  return registrationCompleted ? '/registration-complete' : '/dashboard';
}
