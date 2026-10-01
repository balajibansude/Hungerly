import { ServiceError } from '@hungerly/app-core';

import { useSessionStore } from '@/features/auth/session';
import type { OnboardingService, Services } from '@/services';
import { createMockServices, PROTOTYPE_OTP } from '@/services/mock';

import { useOnboardingStore } from './draft';
import { submitRegistration } from './submit';
import { validDraft } from './testFixtures';

const onboarding = () => useOnboardingStore.getState();
const session = () => useSessionStore.getState();

/** Signs in a new account against the mock and loads a valid draft for it. */
async function prepare(services: Services) {
  const challenge = await services.auth.requestOtp({
    channel: 'phone',
    phoneE164: '+919812345678',
  });
  const signedIn = await services.auth.verifyOtp(challenge.requestId, PROTOTYPE_OTP);
  session().signIn(signedIn);
  onboarding().start(signedIn.user);
  const draft = validDraft();
  for (const section of ['restaurant', 'owner', 'address', 'contact', 'operations'] as const) {
    onboarding().update(section, draft[section]);
  }
}

/** Wraps the mock's onboarding service to fail on demand. */
function flaky(real: OnboardingService) {
  const calls: string[] = [];
  let failNext = true;
  const service: OnboardingService = {
    completeRegistration: (registration, key) => {
      calls.push(key);
      if (failNext) {
        failNext = false;
        return Promise.reject(new ServiceError('network', 'You’re offline.'));
      }
      return real.completeRegistration(registration, key);
    },
  };
  return { service, calls };
}

beforeEach(() => {
  onboarding().reset();
  session().signOut();
});

describe('submitRegistration', () => {
  it('registers, clears the draft and adds the membership to the session', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await prepare(services);

    const outcome = await submitRegistration(services.onboarding);

    expect(outcome).toEqual({ kind: 'submitted', restaurantName: 'Spice Garden' });
    expect(onboarding().draft.restaurant.name).toBe('');
    expect(onboarding().completed?.restaurantName).toBe('Spice Garden');
    expect(session().session?.memberships.map((m) => m.restaurantName)).toEqual(['Spice Garden']);
  });

  it('re-validates the whole draft and reports the first invalid section', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await prepare(services);
    onboarding().update('address', { postalCode: '41' });
    const spy = jest.spyOn(services.onboarding, 'completeRegistration');

    expect(await submitRegistration(services.onboarding)).toEqual({
      kind: 'invalid',
      section: 'address',
    });
    expect(spy).not.toHaveBeenCalled();
    expect(onboarding().draft.address.postalCode).toBe('41');
    expect(onboarding().draft.restaurant.name).toBe('Spice Garden');
  });

  it('keeps the draft on failure and retries with the same key', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await prepare(services);
    const { service, calls } = flaky(services.onboarding);
    const draftBefore = onboarding().draft;

    expect(await submitRegistration(service)).toEqual({
      kind: 'failed',
      message: 'You’re offline.',
    });
    expect(onboarding().draft).toEqual(draftBefore);
    expect(onboarding().submission).toEqual({ status: 'failed', message: 'You’re offline.' });
    expect(session().session?.memberships).toEqual([]);

    expect((await submitRegistration(service)).kind).toBe('submitted');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe(calls[1]);
  });

  it('ignores a second press while the first is still submitting', async () => {
    const services = createMockServices({ latencyMs: 10 });
    await prepare(services);
    const spy = jest.spyOn(services.onboarding, 'completeRegistration');

    const [first, second] = await Promise.all([
      submitRegistration(services.onboarding),
      submitRegistration(services.onboarding),
    ]);

    expect(first.kind).toBe('submitted');
    expect(second).toEqual({ kind: 'busy' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(session().session?.memberships).toHaveLength(1);
  });
});
