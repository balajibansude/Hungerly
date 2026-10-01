import { isServiceError } from '@hungerly/app-core';

import { validDraft } from '@/features/onboarding/testFixtures';
import { parseDraft } from '@/features/onboarding/validation';

import type { RestaurantRegistration, Services } from '../contracts';
import { createMockServices, DEMO_PHONE_E164, PROTOTYPE_OTP } from './index';

const NEW_PHONE = '+919812345678';

async function signIn(services: Services, phoneE164 = NEW_PHONE) {
  const challenge = await services.auth.requestOtp({ channel: 'phone', phoneE164 });
  return services.auth.verifyOtp(challenge.requestId, PROTOTYPE_OTP);
}

function registration(): RestaurantRegistration {
  const parsed = parseDraft(validDraft());
  if (!parsed.ok) throw new Error('fixture draft should be valid');
  return parsed.registration;
}

describe('mock onboarding service', () => {
  it('creates the restaurant, submitted for review and offline', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await signIn(services);
    const { restaurant } = await services.onboarding.completeRegistration(registration(), 'k1');
    expect(restaurant).toMatchObject({
      name: 'Spice Garden',
      cuisines: ['North Indian', 'Biryani'],
      foodType: 'mixed',
      phoneE164: NEW_PHONE,
      email: 'hello@spicegarden.example',
      address: {
        line1: '12 MG Road',
        locality: 'Camp',
        city: 'Pune',
        state: 'Maharashtra',
        postalCode: '411001',
      },
      status: 'pending_review',
      isAcceptingOrders: false,
      avgPrepMinutes: 20,
      minimumOrder: { amountMinor: 19900, currency: 'INR' },
    });
    expect(restaurant.hours).toHaveLength(7);
    expect(restaurant.id).toMatch(/^rst-/);
  });

  it('makes the signed-in user a member of the new restaurant', async () => {
    const services = createMockServices({ latencyMs: 0 });
    const before = await signIn(services);
    const { restaurant, session } = await services.onboarding.completeRegistration(
      registration(),
      'k1',
    );
    expect(session.user.id).toBe(before.user.id);
    expect(session.memberships).toEqual([
      { restaurantId: restaurant.id, restaurantName: 'Spice Garden', role: 'owner' },
    ]);
  });

  it('records the registrant’s name without touching their login identity', async () => {
    const services = createMockServices({ latencyMs: 0 });
    const before = await signIn(services);
    const { session } = await services.onboarding.completeRegistration(registration(), 'k1');
    expect(session.user).toEqual({ ...before.user, fullName: 'Rohan Mehta' });
  });

  it('uses the role chosen at registration', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await signIn(services);
    const input = {
      ...registration(),
      registrant: { fullName: 'Rohan Mehta', role: 'manager' as const },
    };
    const { session } = await services.onboarding.completeRegistration(input, 'k1');
    expect(session.memberships[0]?.role).toBe('manager');
  });

  it('serves the new restaurant through RestaurantService', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await signIn(services);
    const { restaurant } = await services.onboarding.completeRegistration(registration(), 'k1');
    await expect(services.restaurants.get(restaurant.id)).resolves.toEqual(restaurant);
  });

  it('keeps the membership across log out and log in', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await signIn(services);
    const { restaurant } = await services.onboarding.completeRegistration(registration(), 'k1');
    await services.auth.signOut();
    const again = await signIn(services);
    expect(again.user.fullName).toBe('Rohan Mehta');
    expect(again.memberships.map((m) => m.restaurantId)).toEqual([restaurant.id]);
    await expect(services.restaurants.get(restaurant.id)).resolves.toMatchObject({
      name: 'Spice Garden',
    });
  });

  it('leaves the demo restaurant and its owner untouched', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await signIn(services);
    await services.onboarding.completeRegistration(registration(), 'k1');
    await services.auth.signOut();
    const demo = await signIn(services, DEMO_PHONE_E164);
    expect(demo.memberships.map((m) => m.restaurantName)).toEqual(['Masala Junction']);
  });

  it('rejects invalid registrations without creating anything', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await signIn(services);
    const invalid = { ...registration(), address: { ...registration().address, postalCode: '12' } };
    const error = await services.onboarding
      .completeRegistration(invalid, 'k1')
      .catch((e: unknown) => e);
    expect(isServiceError(error) && error.code).toBe('validation');
    expect(isServiceError(error) && error.message).toBe('Enter a valid 6-digit PIN code');
    expect((await services.auth.restoreSession())?.memberships).toEqual([]);
  });

  it('requires a signed-in user', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await expect(
      services.onboarding.completeRegistration(registration(), 'k1'),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('returns the same restaurant when a submission is repeated', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await signIn(services);
    const first = await services.onboarding.completeRegistration(registration(), 'k1');
    const retry = await services.onboarding.completeRegistration(registration(), 'k1');
    expect(retry.restaurant.id).toBe(first.restaurant.id);
    expect(retry.session.memberships).toHaveLength(1);
  });

  it('prevents duplicates even for two submissions in flight at once', async () => {
    const services = createMockServices({ latencyMs: 5 });
    await signIn(services);
    const [a, b] = await Promise.all([
      services.onboarding.completeRegistration(registration(), 'k1'),
      services.onboarding.completeRegistration(registration(), 'k1'),
    ]);
    expect(a.restaurant.id).toBe(b.restaurant.id);
    expect(b.session.memberships).toHaveLength(1);
  });

  it('creates a second restaurant only for a new registration', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await signIn(services);
    const first = await services.onboarding.completeRegistration(registration(), 'k1');
    const second = await services.onboarding.completeRegistration(
      { ...registration(), name: 'Spice Garden Express' },
      'k2',
    );
    expect(second.restaurant.id).not.toBe(first.restaurant.id);
    expect(second.session.memberships).toHaveLength(2);
  });
});
