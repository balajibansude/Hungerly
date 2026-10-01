import { userMessage } from '@hungerly/app-core';

import { useSessionStore } from '@/features/auth/session';
import type { OnboardingService } from '@/services';
import type { RegistrationSection } from '@/services/registrationRules';

import { useOnboardingStore } from './draft';
import { parseDraft } from './validation';

export type SubmitOutcome =
  | { kind: 'submitted'; restaurantName: string }
  | { kind: 'busy' }
  | { kind: 'invalid'; section: RegistrationSection }
  | { kind: 'failed'; message: string };

/**
 * "Complete registration": validates the whole draft again, submits it once, and on
 * success records the completion before updating the session — so when the session's
 * new membership opens the workspace, the gate shows the completion screen first.
 *
 * The draft is only cleared on success; a failure keeps it intact for a retry, which
 * re-sends the same idempotency key so the service never creates a duplicate.
 */
export async function submitRegistration(onboarding: OnboardingService): Promise<SubmitOutcome> {
  const store = useOnboardingStore.getState();
  if (store.submission.status === 'submitting') return { kind: 'busy' };

  const parsed = parseDraft(store.draft);
  if (!parsed.ok) return { kind: 'invalid', section: parsed.section };

  store.beginSubmit();
  try {
    const result = await onboarding.completeRegistration(parsed.registration, store.submissionKey);
    useOnboardingStore.getState().submitSucceeded({
      restaurantId: result.restaurant.id,
      restaurantName: result.restaurant.name,
    });
    useSessionStore.getState().signIn(result.session);
    return { kind: 'submitted', restaurantName: result.restaurant.name };
  } catch (error) {
    const message = userMessage(error);
    useOnboardingStore.getState().submitFailed(message);
    return { kind: 'failed', message };
  }
}
