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
  BranchDetailSchema,
  BusinessSchema,
  MenuItemSchema,
  MenuSchema,
  OkSchema,
  OtpChallengeSchema,
  paths,
  ReviewPageSchema,
  ReviewSchema,
  SignInResponseSchema,
  TokenPairSchema,
} from '@hungerly/api-client';

import { MASALA_JUNCTION_ID } from '@/mock';
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

describe('PATCH /partner/business', () => {
  it('edits only the fields sent and returns a valid Business', async () => {
    const before = (await get('/partner/business')).json;
    const res = await mockFetch(`${BASE}/partner/business`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Renamed Kitchen' }),
    });
    expect(res.status).toBe(200);
    const parsed = BusinessSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new Error(`Schema mismatch: ${JSON.stringify(parsed.error.issues)}`);
    }
    expect(parsed.data.displayName).toBe('Renamed Kitchen');
    expect(parsed.data.legalName).toBe(before.legalName);
    expect(parsed.data.id).toBe(before.id);
  });
});

describe('PUT /partner/branches/:id/menu/items/:itemId/availability', () => {
  it('returns the single updated MenuItem, like the real API', async () => {
    const menu = MenuSchema.parse((await get(paths.partner.menu(MASALA_JUNCTION_ID))).json);
    const item = menu.categories.flatMap((c) => c.items)[0]!;
    const toggle = async (isAvailable: boolean) =>
      mockFetch(`${BASE}${paths.partner.menuItemAvailability(MASALA_JUNCTION_ID, item.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable }),
      });
    try {
      const res = await toggle(!item.isAvailable);
      expect(res.status).toBe(200);
      const parsed = MenuItemSchema.safeParse(await res.json());
      if (!parsed.success) {
        throw new Error(`Schema mismatch: ${JSON.stringify(parsed.error.issues)}`);
      }
      expect(parsed.data.id).toBe(item.id);
      expect(parsed.data.isAvailable).toBe(!item.isAvailable);
    } finally {
      await toggle(item.isAvailable);
    }
  });

  it('is 404 for a menu item that does not exist', async () => {
    const res = await mockFetch(
      `${BASE}${paths.partner.menuItemAvailability(MASALA_JUNCTION_ID, '00000000-0000-4000-8000-0000000000ff')}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: false }),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /partner/branches/:id/reviews/:reviewId/reply and /report', () => {
  const send = (path: string, body: unknown) =>
    mockFetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns the updated Review for a reply, like the real API', async () => {
    const page = ReviewPageSchema.parse((await get(paths.partner.reviews(MASALA_JUNCTION_ID))).json);
    const review = page.items[0]!;
    const res = await send(paths.partner.reviewReply(MASALA_JUNCTION_ID, review.id), { body: 'Thank you!' });
    expect(res.status).toBe(200);
    const parsed = ReviewSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new Error(`Schema mismatch: ${JSON.stringify(parsed.error.issues)}`);
    }
    expect(parsed.data.id).toBe(review.id);
    expect(parsed.data.reply?.body).toBe('Thank you!');
  });

  it('is 404 for a review that does not exist', async () => {
    const res = await send(
      paths.partner.reviewReply(MASALA_JUNCTION_ID, '00000000-0000-4000-8000-0000000000ff'),
      { body: 'Thank you!' },
    );
    expect(res.status).toBe(404);
  });

  it('answers a report with { ok: true }', async () => {
    const page = ReviewPageSchema.parse((await get(paths.partner.reviews(MASALA_JUNCTION_ID))).json);
    const res = await send(paths.partner.reviewReport(MASALA_JUNCTION_ID, page.items[0]!.id), {
      reason: 'other',
      note: null,
    });
    expect(res.status).toBe(200);
    expect(OkSchema.safeParse(await res.json()).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Registration step 1: create branch, then PATCH details
// ---------------------------------------------------------------------------

describe('POST /partner/branches + PATCH /partner/branches/:id', () => {
  async function patch(path: string, body: unknown) {
    const res = await mockFetch(`${BASE}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, ok: res.ok, json: await res.json() };
  }

  // The real API wraps the branch in a BranchDetail envelope: { branch, onboarding }.
  function expectBranch(json: unknown) {
    const parsed = BranchDetailSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Schema mismatch: ${JSON.stringify(parsed.error.issues)}`);
    }
    return parsed.data.branch;
  }

  // Mirrors the body register.tsx sends: description is trimmed, or undefined when blank.
  it.each([
    ['filled', { description: 'Home-style thalis.', cuisines: ['North Indian'], foodType: 'veg_only' }],
    ['empty', { description: '', cuisines: ['North Indian'], foodType: 'veg_only' }],
    ['omitted', { cuisines: ['North Indian'], foodType: 'veg_only' }],
  ])('returns a valid BranchDetail when description is %s', async (_label, details) => {
    const created = expectBranch((await post('/partner/branches', { name: 'Thali House' })).json);

    const { status, json } = await patch(`/partner/branches/${created.id}`, details);
    expect(status).toBe(200);
    const branch = expectBranch(json);
    expect(branch.id).toBe(created.id);
    if ('description' in details) expect(branch.description).toBe(details.description);
    expect(branch.cuisines).toEqual(['North Indian']);
    expect(branch.foodType).toBe('veg_only');
  });
});
