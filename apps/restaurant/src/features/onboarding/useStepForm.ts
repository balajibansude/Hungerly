import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { RegistrationSection } from '@/services/registrationRules';

import { useOnboardingStore, type RegistrationDraft } from './draft';
import { nextStep, stepByKey } from './steps';
import { sectionErrors } from './validation';

/** Route params a form step understands. */
export type StepParams = {
  /** "review" when opened from a Review "Edit" action. */
  from?: string;
  /** "1" when Review sent the user here to fix a problem: show every error at once. */
  showErrors?: string;
};

/**
 * State and navigation for one form step. Values live in the single onboarding store, so
 * moving between steps never loses them; errors come from the shared registration rules
 * and appear next to a field once it has been touched (or all at once when sent from
 * Review). Continue is only enabled when the whole section is valid.
 */
export function useStepForm<S extends RegistrationSection>(section: S) {
  const params = useLocalSearchParams<StepParams>();
  const values = useOnboardingStore((s) => s.draft[section]);
  const draft = useOnboardingStore((s) => s.draft);
  const update = useOnboardingStore((s) => s.update);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors = sectionErrors(draft, section);
  const isValid = Object.keys(errors).length === 0;
  const showAll = params.showErrors === '1';
  const fromReview = params.from === 'review';

  const errorFor = (field: string): string | undefined =>
    showAll || touched[field] ? errors[field] : undefined;
  const touch = (field: string) => setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  const set = (patch: Partial<RegistrationDraft[S]>) => update(section, patch);

  const next = nextStep(section);
  const goNext = () => {
    if (!isValid) return;
    if (fromReview || !next) {
      // Opened from Review: the edits are already in the draft, so just go back to it.
      if (router.canGoBack()) router.back();
      else router.replace(stepByKey('review').href);
      return;
    }
    router.push(next.href);
  };

  return {
    values,
    set,
    errors,
    errorFor,
    touch,
    isValid,
    primary: {
      label: fromReview ? 'Back to review' : 'Continue',
      onPress: goNext,
      disabled: !isValid,
      icon: fromReview ? ('checkmark' as const) : ('arrow-forward' as const),
    },
    footerNote: isValid ? undefined : 'Fill in the required fields to continue.',
  };
}
