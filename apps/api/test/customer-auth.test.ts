import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authSessions, otpChallenges, partnerAccounts, users } from '../src/db/schema';
import { call, createTestContext, signInOwner, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

interface CustomerSignIn {
  tokens: { accessToken: string; refreshToken: string };
  customer: { user: { id: string; fullName: string | null; phoneE164: string | null }; isNewUser: boolean };
}

let counter = 0;
const nextPhone = () => `+9197${String(20_000_000 + (counter += 1) * 6271).slice(-8)}`;

async function requestCode(phoneE164: string) {
  const challenge = await call<{ requestId: string }>(ctx, 'POST', '/auth/otp/request', {
    body: { channel: 'phone', phoneE164 },
  });
  expect(challenge.status).toBe(200);
  return { requestId: challenge.body.requestId, code: ctx.otp.last.get(phoneE164)! };
}

/** Signs in through the real customer OTP flow. */
async function signInCustomer(phoneE164 = nextPhone()) {
  const { requestId, code } = await requestCode(phoneE164);
  const res = await call<CustomerSignIn>(ctx, 'POST', '/customer/auth/otp/verify', { body: { requestId, code } });
  expect(res.status).toBe(200);
  // Keep the per-identifier resend limit from tripping across tests.
  ctx.clock.advance(31_000);
  return { ...res.body, phoneE164 };
}

describe('customer sign-in', () => {
  it('creates a customer session and no partner account', async () => {
    const signedIn = await signInCustomer();
    expect(signedIn.customer.isNewUser).toBe(true);
    expect(signedIn.customer.user.phoneE164).toBe(signedIn.phoneE164);
    expect(signedIn.tokens.accessToken).toBeTruthy();
    expect(signedIn.tokens.refreshToken).toBeTruthy();

    const userId = signedIn.customer.user.id;
    const accounts = await ctx.db.select().from(partnerAccounts).where(eq(partnerAccounts.userId, userId));
    expect(accounts).toHaveLength(0);
    const sessions = await ctx.db.select().from(authSessions).where(eq(authSessions.userId, userId));
    expect(sessions.map((s) => s.audience)).toEqual(['customer']);
  });

  it('reuses the existing user and reports a named customer as returning', async () => {
    const first = await signInCustomer();
    await ctx.db.update(users).set({ fullName: 'Asha Rao' }).where(eq(users.id, first.customer.user.id));
    const again = await signInCustomer(first.phoneE164);
    expect(again.customer.user.id).toBe(first.customer.user.id);
    expect(again.customer.isNewUser).toBe(false);
  });

  it('keeps an existing user without a name flagged for profile setup', async () => {
    const first = await signInCustomer();
    const again = await signInCustomer(first.phoneE164);
    expect(again.customer.isNewUser).toBe(true);
  });

  it('shares the OTP checks: wrong codes count attempts, codes work only once', async () => {
    const phone = nextPhone();
    const { requestId, code } = await requestCode(phone);
    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await call<{ code: string }>(ctx, 'POST', '/customer/auth/otp/verify', { body: { requestId, code: wrong } });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('auth.otp_invalid');
    const [challenge] = await ctx.db.select().from(otpChallenges).where(eq(otpChallenges.id, requestId));
    expect(challenge?.attempts).toBe(1);

    const ok = await call(ctx, 'POST', '/customer/auth/otp/verify', { body: { requestId, code } });
    expect(ok.status).toBe(200);
    const reused = await call(ctx, 'POST', '/customer/auth/otp/verify', { body: { requestId, code } });
    expect(reused.status).toBe(401);
    ctx.clock.advance(31_000);
  });

  it('refuses expired codes', async () => {
    const { requestId, code } = await requestCode(nextPhone());
    ctx.clock.advance(5 * 60_000 + 1_000);
    const res = await call<{ code: string }>(ctx, 'POST', '/customer/auth/otp/verify', { body: { requestId, code } });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('auth.otp_expired');
  });

  it('does not touch an existing partner account when that person signs in as a customer', async () => {
    const owner = await signInOwner(ctx);
    const asCustomer = await signInCustomer(owner.phoneE164);
    expect(asCustomer.customer.user.id).toBe(owner.userId);
    const accounts = await ctx.db.select().from(partnerAccounts).where(eq(partnerAccounts.userId, owner.userId));
    expect(accounts.map((a) => a.role)).toEqual(['owner']);
    // The partner session is still valid alongside the customer one.
    const me = await call(ctx, 'GET', '/partner/me', { token: owner.token });
    expect(me.status).toBe(200);
  });
});

describe('customer and partner session separation', () => {
  it('rotates customer refresh tokens and revokes the session on reuse', async () => {
    const { tokens } = await signInCustomer();
    const first = await call<{ refreshToken: string; accessToken: string }>(ctx, 'POST', '/customer/auth/refresh', {
      body: { refreshToken: tokens.refreshToken },
    });
    expect(first.status).toBe(200);
    const reuse = await call(ctx, 'POST', '/customer/auth/refresh', { body: { refreshToken: tokens.refreshToken } });
    expect(reuse.status).toBe(401);
    const afterReuse = await call(ctx, 'POST', '/customer/auth/refresh', {
      body: { refreshToken: first.body.refreshToken },
    });
    expect(afterReuse.status).toBe(401);
  });

  it('rejects customer access tokens on partner routes', async () => {
    const { tokens } = await signInCustomer();
    const me = await call(ctx, 'GET', '/partner/me', { token: tokens.accessToken });
    expect(me.status).toBe(401);
    const logout = await call(ctx, 'POST', '/auth/logout', { token: tokens.accessToken });
    expect(logout.status).toBe(401);
  });

  it('does not refresh a customer token at the partner endpoint, or a partner token at the customer endpoint', async () => {
    const customer = await signInCustomer();
    const owner = await signInOwner(ctx);
    const crossToPartner = await call(ctx, 'POST', '/auth/refresh', {
      body: { refreshToken: customer.tokens.refreshToken },
    });
    expect(crossToPartner.status).toBe(401);
    const crossToCustomer = await call(ctx, 'POST', '/customer/auth/refresh', {
      body: { refreshToken: owner.refreshToken },
    });
    expect(crossToCustomer.status).toBe(401);
    // A failed cross-audience attempt is not treated as reuse: both tokens still work at home.
    const customerOk = await call(ctx, 'POST', '/customer/auth/refresh', {
      body: { refreshToken: customer.tokens.refreshToken },
    });
    expect(customerOk.status).toBe(200);
    const partnerOk = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: owner.refreshToken } });
    expect(partnerOk.status).toBe(200);
  });
});
