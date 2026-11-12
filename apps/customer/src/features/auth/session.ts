import type { Session, User } from '@hungerly/types';
import { create } from 'zustand';

import { setSessionExpiredHandler } from '@/lib/api';
import { clearTokens } from '@/lib/tokens';

/**
 * App session state (who is signed in). It holds no tokens: with the real API the auth
 * service keeps them in secure storage (`@/lib/tokens`) and restores the session at
 * startup; in mock mode sign-in is repeated after the app restarts.
 *
 * No session means the customer is browsing as a guest. Guests can explore the whole
 * catalogue and build a cart; signing in is only required to place an order or to use
 * account features (orders, favourites, addresses).
 */
interface SessionState {
  /** True once the startup session check has finished (success or not). */
  isRestored: boolean;
  session: Session | null;
  /**
   * A verified first-time sign-in that is still on profile setup. Kept apart from
   * `session` so the app does not treat the customer as signed in until setup finishes.
   */
  pendingSession: Session | null;
  markRestored: (session: Session | null) => void;
  beginProfileSetup: (session: Session) => void;
  signIn: (session: Session) => void;
  updateUser: (user: User) => void;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  isRestored: false,
  session: null,
  pendingSession: null,
  markRestored: (session) => set({ isRestored: true, session }),
  beginProfileSetup: (session) => set({ pendingSession: session }),
  signIn: (session) => set({ session, pendingSession: null }),
  updateUser: (user) =>
    set((state) =>
      state.session ? { session: { ...state.session, user, isNewUser: false } } : state,
    ),
  signOut: () => set({ session: null, pendingSession: null }),
}));

/**
 * Called by the API client when a real session can no longer be renewed. Resets the store
 * to a guest and forgets any tokens locally. It deliberately does not call
 * `auth.signOut()`: that would request a server logout with the dead session and could
 * expire it again. The cart is kept so the customer can sign in and continue.
 */
export function handleSessionExpired(): void {
  useSessionStore.getState().signOut();
  clearTokens().catch(() => undefined);
}

// Registered once, when this module first loads. Never fires in mock mode (no API calls).
setSessionExpiredHandler(handleSessionExpired);

/** First-time customers are asked for their name before they continue. */
export function needsProfileSetup(session: Session): boolean {
  return session.isNewUser && !session.user.fullName;
}

export type EntryRoute = '/home';

/**
 * Where the app should open after the splash. Pure, so it is easy to test. There is no
 * intro and signing in is never required to enter: everyone lands on Home, guests too.
 */
export function entryRouteFor(_state: Pick<SessionState, 'session'>): EntryRoute {
  return '/home';
}
