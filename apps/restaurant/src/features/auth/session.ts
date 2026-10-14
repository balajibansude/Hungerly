import {
  paths,
  PartnerSessionSchema,
  type BranchSummary,
  type PartnerSession,
  type SignInResponse,
} from '@hungerly/api-client';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { api, clearTokens, restoreTokens, setSessionExpiredHandler, storeTokens } from '@/lib/api';

/**
 * Who is signed in, their business and branches, and which branch the app is showing.
 * The server is the source of truth: this store only caches `GET /partner/me`, and is
 * refreshed after any change that affects branches (registration, new branch, approval).
 */

const ACTIVE_BRANCH_KEY = 'swaadone.partner.activeBranchId';

interface SessionState {
  /** False until the startup check (stored refresh token → /partner/me) has finished. */
  isRestored: boolean;
  session: PartnerSession | null;
  activeBranchId: string | null;
  restore: () => Promise<void>;
  signIn: (response: SignInResponse) => Promise<void>;
  /** Re-reads /partner/me (after creating or changing branches). */
  reload: () => Promise<PartnerSession | null>;
  selectBranch: (branchId: string) => void;
  /** Local sign-out; call the API logout first when online (see useSignOut). */
  signOut: () => Promise<void>;
}

function pickBranch(session: PartnerSession, preferred: string | null): string | null {
  if (preferred && session.branches.some((b) => b.id === preferred)) return preferred;
  return session.branches[0]?.id ?? null;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  isRestored: false,
  session: null,
  activeBranchId: null,

  async restore() {
    try {
      const renewed = await restoreTokens();
      if (!renewed) {
        set({ isRestored: true, session: null });
        return;
      }
      const session = await api.request('GET', paths.partner.me, { schema: PartnerSessionSchema });
      const saved = await SecureStore.getItemAsync(ACTIVE_BRANCH_KEY).catch(() => null);
      set({ isRestored: true, session, activeBranchId: pickBranch(session, saved) });
    } catch {
      // Offline or server error at startup: show login rather than a broken workspace.
      set({ isRestored: true, session: null });
    }
  },

  async signIn(response) {
    await storeTokens(response.tokens);
    const saved = await SecureStore.getItemAsync(ACTIVE_BRANCH_KEY).catch(() => null);
    set({ session: response.session, activeBranchId: pickBranch(response.session, saved), isRestored: true });
  },

  async reload() {
    const session = await api.request('GET', paths.partner.me, { schema: PartnerSessionSchema });
    set({ session, activeBranchId: pickBranch(session, get().activeBranchId) });
    return session;
  },

  selectBranch(branchId) {
    set({ activeBranchId: branchId });
    SecureStore.setItemAsync(ACTIVE_BRANCH_KEY, branchId).catch(() => undefined);
  },

  async signOut() {
    await clearTokens();
    set({ session: null, activeBranchId: null });
  },
}));

setSessionExpiredHandler(() => {
  useSessionStore.getState().signOut().catch(() => undefined);
});

export function activeBranch(session: PartnerSession | null, activeBranchId: string | null): BranchSummary | null {
  if (!session) return null;
  return session.branches.find((b) => b.id === activeBranchId) ?? session.branches[0] ?? null;
}

/** Returns the first branch as a membership-like object. For multi-branch use `useActiveBranch`. */
export function activeMembership(session: PartnerSession | null): { restaurantId: string } | null {
  const branch = session?.branches[0] ?? null;
  if (!branch) return null;
  return { restaurantId: branch.id };
}

export interface RouteAccess {
  signedOut: boolean;
  /** Signed in without any branch yet: business profile + first branch setup. */
  needsOnboarding: boolean;
  /** Signed in with at least one branch (draft branches show "continue setup"). */
  hasWorkspace: boolean;
}

/** Which route groups are reachable. Drives the `Stack.Protected` guards (UX only; the API enforces access). */
export function routeAccessFor(session: PartnerSession | null): RouteAccess {
  const hasWorkspace = (session?.branches.length ?? 0) > 0;
  return {
    signedOut: session === null,
    needsOnboarding: session !== null && !hasWorkspace,
    hasWorkspace,
  };
}

export type EntryRoute = '/login' | '/welcome' | '/home';

export function entryRouteFor(session: PartnerSession | null): EntryRoute {
  const access = routeAccessFor(session);
  if (access.signedOut) return '/login';
  if (access.needsOnboarding) return '/welcome';
  return '/home';
}
