import type { OnboardingChecklist, OnboardingStep } from '@hungerly/api-client';

/** Wizard order. Matches the server checklist (`OnboardingStepSchema`). */
export const STEP_ORDER: OnboardingStep[] = [
  'business',
  'details',
  'location',
  'contact',
  'hours',
  'licence',
  'bank',
  'declaration',
];

export const STEP_META: Record<OnboardingStep, { title: string; summary: string }> = {
  business: { title: 'Business profile', summary: 'Legal name and business type' },
  details: { title: 'Restaurant details', summary: 'Name, cuisines and food type' },
  location: { title: 'Location', summary: 'Address and map pin' },
  contact: { title: 'Contact', summary: 'Branch phone and email' },
  hours: { title: 'Opening hours', summary: 'Sessions and breaks for each day' },
  licence: { title: 'Food licence', summary: 'FSSAI licence for this branch' },
  bank: { title: 'Bank & payouts', summary: 'Account for earnings and bank proof' },
  declaration: { title: 'Declaration', summary: 'Food safety and accuracy commitments' },
};

export function isOnboardingStep(value: string | undefined): value is OnboardingStep {
  return value !== undefined && (STEP_ORDER as string[]).includes(value);
}

/** 1-based position for "Step 3 of 8". */
export function stepNumber(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step) + 1;
}

export function nextStep(step: OnboardingStep): OnboardingStep | null {
  return STEP_ORDER[STEP_ORDER.indexOf(step) + 1] ?? null;
}

export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const index = STEP_ORDER.indexOf(step);
  return index > 0 ? STEP_ORDER[index - 1]! : null;
}

/** The first incomplete step in wizard order, or null when every step is complete. */
export function firstIncompleteStep(checklist: OnboardingChecklist): OnboardingStep | null {
  const incomplete = new Set(checklist.steps.filter((s) => !s.complete).map((s) => s.step));
  return STEP_ORDER.find((step) => incomplete.has(step)) ?? null;
}

export function completedCount(checklist: OnboardingChecklist): number {
  return checklist.steps.filter((s) => s.complete).length;
}

const STEP_ROUTES: Record<string, string> = {
  restaurant: '/branches/new',
  business: '/business',
  details: '/business',
  location: '/business',
  contact: '/business',
  hours: '/hours',
  licence: '/documents',
  bank: '/documents',
  declaration: '/declaration',
};

/** Maps an onboarding step key (or 'restaurant' for the first registration step) to its route href. */
export function stepByKey(key: string): { href: string } {
  return { href: STEP_ROUTES[key] ?? '/business' };
}
