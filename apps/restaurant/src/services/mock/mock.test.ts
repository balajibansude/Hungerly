import { isServiceError } from '@hungerly/app-core';

import { MASALA_JUNCTION_ID } from '../../mock';
import type { LoginIdentifier, Services } from '../contracts';
import { createMockServices, DEMO_PHONE_E164, PROTOTYPE_OTP } from './index';

async function signIn(services: Services, identifier: LoginIdentifier) {
  const challenge = await services.auth.requestOtp(identifier);
  return services.auth.verifyOtp(challenge.requestId, PROTOTYPE_OTP);
}

describe('mock auth', () => {
  it('signs the demo number in as the owner of Masala Junction', async () => {
    const services = createMockServices({ latencyMs: 0 });
    const session = await signIn(services, { channel: 'phone', phoneE164: DEMO_PHONE_E164 });
    expect(session.user.fullName).toBe('Aditi Kulkarni');
    expect(session.memberships).toEqual([
      { restaurantId: MASALA_JUNCTION_ID, restaurantName: 'Masala Junction', role: 'owner' },
    ]);
  });

  it('gives any other phone or email a new account with no restaurant', async () => {
    const services = createMockServices({ latencyMs: 0 });
    const byPhone = await signIn(services, { channel: 'phone', phoneE164: '+919812345678' });
    expect(byPhone.memberships).toEqual([]);
    expect(byPhone.user.phoneE164).toBe('+919812345678');

    const byEmail = await signIn(services, { channel: 'email', email: ' New@Kitchen.Example ' });
    expect(byEmail.memberships).toEqual([]);
    expect(byEmail.user.email).toBe('new@kitchen.example');
    expect(byEmail.user.phoneE164).toBeNull();
    expect(byEmail.user.id).not.toBe(byPhone.user.id);
  });

  it('recognises a returning identity, ignoring email case', async () => {
    const services = createMockServices({ latencyMs: 0 });
    const first = await signIn(services, { channel: 'email', email: 'chef@kitchen.example' });
    const again = await signIn(services, { channel: 'email', email: 'CHEF@kitchen.example' });
    expect(again.user.id).toBe(first.user.id);
  });

  it('rejects a wrong code and keeps the challenge usable', async () => {
    const services = createMockServices({ latencyMs: 0 });
    const challenge = await services.auth.requestOtp({
      channel: 'phone',
      phoneE164: DEMO_PHONE_E164,
    });
    await expect(services.auth.verifyOtp(challenge.requestId, '000000')).rejects.toMatchObject({
      code: 'auth.otp_invalid',
    });
    await expect(services.auth.verifyOtp(challenge.requestId, PROTOTYPE_OTP)).resolves.toBeTruthy();
  });

  it('does not accept a code twice or for an unknown request', async () => {
    const services = createMockServices({ latencyMs: 0 });
    const challenge = await services.auth.requestOtp({
      channel: 'phone',
      phoneE164: DEMO_PHONE_E164,
    });
    await services.auth.verifyOtp(challenge.requestId, PROTOTYPE_OTP);
    const reused = await services.auth
      .verifyOtp(challenge.requestId, PROTOTYPE_OTP)
      .catch((e: unknown) => e);
    expect(isServiceError(reused) && reused.code).toBe('auth.otp_expired');
    await expect(services.auth.verifyOtp('otp-unknown', PROTOTYPE_OTP)).rejects.toMatchObject({
      code: 'auth.otp_expired',
    });
  });

  it('restores the session until sign-out', async () => {
    const services = createMockServices({ latencyMs: 0 });
    expect(await services.auth.restoreSession()).toBeNull();
    const session = await signIn(services, { channel: 'phone', phoneE164: DEMO_PHONE_E164 });
    expect(await services.auth.restoreSession()).toEqual(session);
    await services.auth.signOut();
    expect(await services.auth.restoreSession()).toBeNull();
  });
});

describe('mock restaurant profile', () => {
  it('loads Masala Junction for its owner', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await signIn(services, { channel: 'phone', phoneE164: DEMO_PHONE_E164 });
    const restaurant = await services.restaurants.get(MASALA_JUNCTION_ID);
    expect(restaurant.name).toBe('Masala Junction');
    expect(restaurant.address.locality).toBe('Koregaon Park');
    expect(restaurant.address.city).toBe('Pune');
    expect(restaurant.status).toBe('active');
  });

  it('hides restaurants from people who do not work there', async () => {
    const services = createMockServices({ latencyMs: 0 });
    await expect(services.restaurants.get(MASALA_JUNCTION_ID)).rejects.toMatchObject({
      code: 'not_found',
    });
    await signIn(services, { channel: 'phone', phoneE164: '+919812345678' });
    await expect(services.restaurants.get(MASALA_JUNCTION_ID)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('keeps each mock instance independent', async () => {
    const a = createMockServices({ latencyMs: 0 });
    const b = createMockServices({ latencyMs: 0 });
    await signIn(a, { channel: 'phone', phoneE164: DEMO_PHONE_E164 });
    expect(await b.auth.restoreSession()).toBeNull();
  });
});
