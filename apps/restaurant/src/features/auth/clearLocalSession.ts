import { useOnboardingStore } from '@/features/onboarding/draft';
import { useOrdersStore } from '@/features/orders/store';

import { useSessionStore } from './session';

/**
 * Forgets everything this device holds for the signed-in person: the registration draft
 * (and any pending completion screen), cached orders and the session. The route guards
 * then show login.
 */
export function clearLocalSession(): void {
  useOnboardingStore.getState().reset();
  useOrdersStore.getState().reset();
  useSessionStore.getState().signOut();
}
