import { useOnboardingStore } from '@/features/onboarding/draft';

import { useSessionStore } from './session';

/**
 * Forgets everything this device holds for the signed-in person: the registration draft
 * (and any pending completion screen) and the session. The route guards then show login.
 */
export function clearLocalSession(): void {
  useOnboardingStore.getState().reset();
  useSessionStore.getState().signOut();
}
