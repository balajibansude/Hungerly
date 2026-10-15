/**
 * Contract tests for the prototype mock fetch layer.
 *
 * These tests verify that every auth response the mock returns passes the exact
 * Zod schemas that the production API client validates against. If a test breaks
 * here, the mock and schema are out of sync — fix the mock, not the schema.
 *
 * Test credentials (development only — no real SMS is sent):
 *   Demo phone : +919876543210  (or "98765 43210" as typed in the form)
 *   Any phone  : any valid E.164 Indian mobile number
 *   Test OTP   : 123456
 */

import {
  OtpChallengeSchema,
  SignInResponseSchema,
  TokenPairSchema,
} from '@hungerly/api-client';

import { DEMO_PHONE_E164, PROTOTYPE_OTP } from '@/services/mock';

import { mockFetch } from './mockFetch';

const BASE = 'http://prototype.swaadone.invalid/api/v1';

async function post(path: string, body: unknown) {
  const res = await mockFetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, ok: res.ok, json: await res.json() };
}

async function get(path: string) {
  const res = await mockFetch(`${BASE}${path}`, { method: 'GET' });
  return { status: res.status, ok: res.ok, json: await res.json() };
}

// ---------------------------------------------------------------------------
// OTP request
// ---------------------------------------------------------------------------

describe('POST /auth/otp/request', () => {
  it('returns a valid OtpChallenge for the demo phone', async () => {
    const { status, ok, json } = await post('/auth/otp/request', {
      channel: 'phone',
      phoneE164: DEMO_PHONE_E164,
    });
    expect(status).toBe(200);
    expect(ok).toBe(true);
    // This is the exact runtime check that createApiClient performs.
    const parsed = OtpChallengeSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Schema mismatch: ${JSON.stringify(parsed.error.issues)}`);
    }
    expect(parsed.data.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(parsed.data.expiresInSeconds).toBeGreaterThan(0);
    expect(parsed.data.resendAfterSeconds).toBeGreaterThan(0);
  });

  it('returns a valid OtpChallenge for an arbitrary Indian mobile number', async () => {
    const { json } = await post('/auth/otp/request', {
      channel: 'phone',
      phoneE164: '+919123456789',
    });
    const parsed = OtpChallengeSchema.safeParse(json);
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// OTP verify — success paths
// ---------------------------------------------------------------------------

describe('POST /auth/otp/verify', () => {
  async function requestOtp(phone: string) {
    const { json } = await post('/auth/otp/request', { channel: 'phone', phoneE164: phone });
    const challenge = OtpChallengeSchema.parse(json);
    return challenge;
  }

  it('signs in the demo account with the test OTP and returns a valid SignInResponse', async () => {
    // NOTE: The test OTP is 123456. No real SMS is sent in mock mode.
    const challenge = await requestOtp(DEMO_PHONE_E164);
    const { status, ok, json } = await post('/auth/otp/verify', {
      requestId: challenge.requestId,
      code: PROTOTYPE_OTP,
    });
    expect(status).toBe(200);
    expect(ok).toBe(true);
    const parsed = SignInResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Schema mismatch: ${JSON.stringify(parsed.error.issues)}`);
    }
    expect(parsed.data.session.branches).toHaveLength(1);
    expect(parsed.data.session.business).not.toBeNull();
    // Confirms demo session has the Masala Junction restaurant
    expect(parsed.data.session.branches[0]?.name).toContain('Masala Junction');
  });

  it('returns a new-user session (no branches) for an unknown number', async () => {
    const challenge = await requestOtp('+919000000001');
    const { status, json } = await post('/auth/otp/verify', {
      requestId: challenge.requestId,
      code: PROTOTYPE_OTP,
    });
    expect(status).toBe(200);
    const parsed = SignInResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Schema mismatch: ${JSON.stringify(parsed.error.issues)}`);
    }
    expect(parsed.data.session.branches).toHaveLength(0);
    expect(parsed.data.session.business).toBeNull();
  });

  it('rejects a wrong OTP with 401', async () => {
    const challenge = await requestOtp(DEMO_PHONE_E164);
    const { status, ok } = await post('/auth/otp/verify', {
      requestId: challenge.requestId,
      code: '000000',
    });
    expect(status).toBe(401);
    expect(ok).toBe(false);
  });

  it('rejects a mismatched requestId with 401', async () => {
    await requestOtp(DEMO_PHONE_E164);
    const { status } = await post('/auth/otp/verify', {
      requestId: '00000000-0000-4000-8000-000000000099', // never issued
      code: PROTOTYPE_OTP,
    });
    expect(status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

describe('POST /auth/refresh', () => {
  it('accepts the demo refresh token and returns a valid TokenPair', async () => {
    // Sign in first to establish the demo session
    const { json: challengeJson } = await post('/auth/otp/request', {
      channel: 'phone',
      phoneE164: DEMO_PHONE_E164,
    });
    const challenge = OtpChallengeSchema.parse(challengeJson);
    const { json: signInJson } = await post('/auth/otp/verify', {
      requestId: challenge.requestId,
      code: PROTOTYPE_OTP,
    });
    const signIn = SignInResponseSchema.parse(signInJson);

    const { status, json } = await post('/auth/refresh', {
      refreshToken: signIn.tokens.refreshToken,
    });
    expect(status).toBe(200);
    const parsed = TokenPairSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Schema mismatch: ${JSON.stringify(parsed.error.issues)}`);
    }
  });

  it('rejects an unknown refresh token with 401', async () => {
    const { status } = await post('/auth/refresh', { refreshToken: 'invalid-token' });
    expect(status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Partner session
// ---------------------------------------------------------------------------

describe('GET /partner/me', () => {
  it('returns session data that passes SignInResponse.session schema', async () => {
    const { status, json } = await get('/partner/me');
    expect(status).toBe(200);
    // session is the PartnerSession subset of SignInResponseSchema
    const parsed = SignInResponseSchema.shape.session.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Schema mismatch: ${JSON.stringify(parsed.error.issues)}`);
    }
  });
});
