import type { Session, User } from '@hungerly/types';
import { create } from 'zustand';

/**
 * App session state. In-memory only for the prototype: onboarding and sign-in are
 * repeated after the app restarts. Persistent, secure token storage arrives with real
 * authentication (docs/SECURITY.md → JWT and session strategy).
 */
interface SessionState {
  /** True once the startup session check has finished (success or not). */
  isRestored: boolean;
  hasSeenOnboarding: boolean;
  session: Session | null;
  markRestored: (session: Session | null) => void;
  completeOnboarding: () => void;
  signIn: (session: Session) => void;
  updateUser: (user: User) => void;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  isRestored: false,
  hasSeenOnboarding: false,
  session: null,
  markRestored: (session) => set({ isRestored: true, session }),
  completeOnboarding: () => set({ hasSeenOnboarding: true }),
  signIn: (session) => set({ session, hasSeenOnboarding: true }),
  updateUser: (user) =>
    set((state) =>
      state.session ? { session: { ...state.session, user, isNewUser: false } } : state,
    ),
  signOut: () => set({ session: null }),
}));

export type EntryRoute = '/onboarding' | '/login' | '/profile-setup' | '/home';

/** Where the app should go for the current session state. Pure, so it is easy to test. */
export function entryRouteFor(
  state: Pick<SessionState, 'session' | 'hasSeenOnboarding'>,
): EntryRoute {
  if (state.session) {
    return state.session.isNewUser && !state.session.user.fullName ? '/profile-setup' : '/home';
  }
  return state.hasSeenOnboarding ? '/login' : '/onboarding';
}
