import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authSessions, users } from '../src/db/schema';
import { call, createTestContext, signInAdmin, signInOwner, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

interface Profile {
  id: string;
  fullName: string | null;
  phoneE164: string | null;
  email: string | null;
}

let counter = 0;
async function signInCustomer() {
  const phoneE164 = `+9195${String(40_000_000 + (counter += 1) * 3571).slice(-8)}`;
  const challenge = await call<{ requestId: string }>(ctx, 'POST', '/auth/otp/request', {
    body: { channel: 'phone', phoneE164 },
  });
  const res = await call<{ tokens: { accessToken: string; refreshToken: string }; customer: { user: Profile } }>(
    ctx,
    'POST',
    '/customer/auth/otp/verify',
    { body: { requestId: challenge.body.requestId, code: ctx.otp.last.get(phoneE164)! } },
  );
  expect(res.status).toBe(200);
  return { ...res.body.tokens, userId: res.body.customer.user.id, phoneE164 };
}

describe('GET /customer/me', () => {
  it('returns only the customer’s own identity fields', async () => {
    const customer = await signInCustomer();
    const me = await call<Record<string, unknown>>(ctx, 'GET', '/customer/me', { token: customer.accessToken });
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ id: customer.userId, fullName: null, phoneE164: customer.phoneE164, email: null });
  });

  it('requires a customer session', async () => {
    expect((await call(ctx, 'GET', '/customer/me')).status).toBe(401);
    const owner = await signInOwner(ctx);
    expect((await call(ctx, 'GET', '/customer/me', { token: owner.token })).status).toBe(401);
    const admin = await signInAdmin(ctx);
    expect((await call(ctx, 'GET', '/customer/me', { token: admin.token })).status).toBe(401);
  });
});

describe('PATCH /customer/me', () => {
  it('updates the name (trimmed) and returns the profile', async () => {
    const customer = await signInCustomer();
    const res = await call<Profile>(ctx, 'PATCH', '/customer/me', {
      token: customer.accessToken,
      body: { fullName: '  Asha Rao  ' },
    });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('Asha Rao');
    const [row] = await ctx.db.select().from(users).where(eq(users.id, customer.userId));
    expect(row?.fullName).toBe('Asha Rao');
  });

  it.each([
    ['a too-short name', { fullName: 'A' }],
    ['a missing name', {}],
    ['an email change', { fullName: 'Asha Rao', email: 'victim@example.com' }],
    ['a phone change', { fullName: 'Asha Rao', phoneE164: '+919999999999' }],
    ['an id change', { fullName: 'Asha Rao', id: '00000000-0000-4000-8000-000000000000' }],
    ['a status change', { fullName: 'Asha Rao', status: 'active' }],
    ['a role', { fullName: 'Asha Rao', role: 'owner' }],
  ])('refuses %s and changes nothing', async (_label, body) => {
    const customer = await signInCustomer();
    const res = await call<{ code: string }>(ctx, 'PATCH', '/customer/me', { token: customer.accessToken, body });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('validation');
    const [row] = await ctx.db.select().from(users).where(eq(users.id, customer.userId));
    expect(row).toMatchObject({
      id: customer.userId,
      fullName: null,
      email: null,
      phoneE164: customer.phoneE164,
      status: 'active',
    });
  });

  it('requires a customer session', async () => {
    const owner = await signInOwner(ctx);
    const res = await call(ctx, 'PATCH', '/customer/me', { token: owner.token, body: { fullName: 'Asha Rao' } });
    expect(res.status).toBe(401);
    const [row] = await ctx.db.select().from(users).where(eq(users.id, owner.userId));
    expect(row?.fullName).toBeNull();
  });
});

describe('POST /customer/auth/logout', () => {
  it('revokes only the current customer session', async () => {
    const customer = await signInCustomer();
    ctx.clock.advance(31_000);
    const otherDevice = await call<{ requestId: string }>(ctx, 'POST', '/auth/otp/request', {
      body: { channel: 'phone', phoneE164: customer.phoneE164 },
    });
    const second = await call<{ tokens: { accessToken: string } }>(ctx, 'POST', '/customer/auth/otp/verify', {
      body: { requestId: otherDevice.body.requestId, code: ctx.otp.last.get(customer.phoneE164)! },
    });

    const res = await call<{ ok: boolean }>(ctx, 'POST', '/customer/auth/logout', { token: customer.accessToken });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    expect((await call(ctx, 'GET', '/customer/me', { token: customer.accessToken })).status).toBe(401);
    const refresh = await call(ctx, 'POST', '/customer/auth/refresh', { body: { refreshToken: customer.refreshToken } });
    expect(refresh.status).toBe(401);
    // The other device stays signed in.
    expect((await call(ctx, 'GET', '/customer/me', { token: second.body.tokens.accessToken })).status).toBe(200);

    const sessions = await ctx.db.select().from(authSessions).where(eq(authSessions.userId, customer.userId));
    expect(sessions.filter((s) => s.revokedAt !== null).map((s) => s.revokedReason)).toEqual(['logout']);
  });

  it('requires a customer session and leaves partner sessions alone', async () => {
    expect((await call(ctx, 'POST', '/customer/auth/logout')).status).toBe(401);
    const owner = await signInOwner(ctx);
    expect((await call(ctx, 'POST', '/customer/auth/logout', { token: owner.token })).status).toBe(401);
    expect((await call(ctx, 'GET', '/partner/me', { token: owner.token })).status).toBe(200);
  });
});
