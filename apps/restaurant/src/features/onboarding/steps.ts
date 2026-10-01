import type { RegistrationSection } from '@/services/registrationRules';

/**
 * The registration flow, in order (R3). Steps 1–5 collect one section each, step 6
 * reviews everything and step 7 confirms success.
 */
export const REGISTRATION_STEPS = [
  { key: 'restaurant', title: 'Restaurant details', href: '/register/details' },
  { key: 'owner', title: 'Owner or manager', href: '/register/owner' },
  { key: 'address', title: 'Address', href: '/register/address' },
  { key: 'contact', title: 'Contact', href: '/register/contact' },
  { key: 'operations', title: 'Operations', href: '/register/operations' },
  { key: 'review', title: 'Review', href: '/register/review' },
  { key: 'complete', title: 'Registration complete', href: '/registration-complete' },
] as const;

export type RegistrationStep = (typeof REGISTRATION_STEPS)[number];
export type RegistrationStepKey = RegistrationStep['key'];

export const TOTAL_STEPS = REGISTRATION_STEPS.length;

export function stepNumber(key: RegistrationStepKey): number {
  return REGISTRATION_STEPS.findIndex((step) => step.key === key) + 1;
}

export function stepByKey<K extends RegistrationStepKey>(key: K) {
  const step = REGISTRATION_STEPS.find((s) => s.key === key);
  if (!step) throw new Error(`Unknown registration step ${key}`);
  return step as Extract<RegistrationStep, { key: K }>;
}

/** The step after `key`, for the Next button on steps 1–5. */
export function nextStep(key: RegistrationStepKey): RegistrationStep | null {
  return REGISTRATION_STEPS[stepNumber(key)] ?? null;
}

/** The form step that edits a review section. */
export function stepForSection(section: RegistrationSection) {
  return stepByKey(section);
}
