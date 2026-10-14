import { clearTokens } from '@/lib/api';

import { useOrdersStore } from '@/features/orders/store';

import { useSessionStore } from './session';

/** Wipes every local credential and cached data — called on sign-out and session expiry. */
export function clearLocalSession(): void {
  clearTokens();
  useSessionStore.getState().signOut().catch(() => undefined);
  useOrdersStore.getState().reset();
}
