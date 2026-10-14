import type { OnboardingChecklist } from '@hungerly/api-client';

import { completedCount, firstIncompleteStep, isOnboardingStep, nextStep, previousStep, STEP_ORDER, stepNumber } from './steps';

const checklist = (incomplete: string[]): OnboardingChecklist => ({
  steps: STEP_ORDER.map((step) => ({ step, complete: !incomplete.includes(step), hint: incomplete.includes(step) ? 'todo' : null })),
  canSubmit: incomplete.length === 0,
  approvalBlockers: [],
});

describe('onboarding steps', () => {
  it('numbers steps from 1 in wizard order', () => {
    expect(stepNumber('business')).toBe(1);
    expect(stepNumber('declaration')).toBe(8);
  });

  it('moves forward and back, stopping at the ends', () => {
    expect(nextStep('details')).toBe('location');
    expect(nextStep('declaration')).toBeNull();
    expect(previousStep('business')).toBeNull();
    expect(previousStep('hours')).toBe('contact');
  });

  it('validates route params', () => {
    expect(isOnboardingStep('licence')).toBe(true);
    expect(isOnboardingStep('manager')).toBe(false);
    expect(isOnboardingStep(undefined)).toBe(false);
  });

  it('finds the first incomplete step in wizard order, not server order', () => {
    expect(firstIncompleteStep(checklist(['declaration', 'location']))).toBe('location');
    expect(firstIncompleteStep(checklist([]))).toBeNull();
    expect(completedCount(checklist(['bank']))).toBe(7);
  });
});
