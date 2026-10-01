import { nextStep, REGISTRATION_STEPS, stepByKey, stepNumber, TOTAL_STEPS } from './steps';
import { shiftTime } from './time';

describe('registration steps', () => {
  it('has seven steps in the agreed order', () => {
    expect(TOTAL_STEPS).toBe(7);
    expect(REGISTRATION_STEPS.map((s) => s.title)).toEqual([
      'Restaurant details',
      'Owner or manager',
      'Address',
      'Contact',
      'Operations',
      'Review',
      'Registration complete',
    ]);
    expect(stepNumber('owner')).toBe(2);
    expect(stepNumber('complete')).toBe(7);
  });

  it('moves forward one step at a time, ending at completion', () => {
    expect(nextStep('restaurant')?.key).toBe('owner');
    expect(nextStep('operations')?.key).toBe('review');
    expect(nextStep('review')?.key).toBe('complete');
    expect(nextStep('complete')).toBeNull();
  });

  it('keeps registration under onboarding and completion with the workspace', () => {
    for (const key of [
      'restaurant',
      'owner',
      'address',
      'contact',
      'operations',
      'review',
    ] as const) {
      expect(stepByKey(key).href.startsWith('/register/')).toBe(true);
    }
    expect(stepByKey('complete').href).toBe('/registration-complete');
  });
});

describe('time stepper', () => {
  it('moves in half hours and wraps around midnight', () => {
    expect(shiftTime('11:00', 1)).toBe('11:30');
    expect(shiftTime('11:00', -2)).toBe('10:00');
    expect(shiftTime('23:30', 1)).toBe('00:00');
    expect(shiftTime('00:00', -1)).toBe('23:30');
  });
});
