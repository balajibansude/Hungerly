import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { otpChallenges, partnerAccounts, users } from '../src/db/schema';
import { call, createTestContext, signInOwner, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('partner sign-in', () => {
  it('creates an owner-only partner account on first sign-in', async () => {
    const owner = await signInOwner(ctx);
    const me = await call<{ user: { id: string }; business: null; branches: unknown[] }>(ctx, 'GET', '/partner/me', {
      token: owner.token,
    });
    expect(me.status).toBe(200);
    expect(me.body.business).toBeNull();
    const [account] = await ctx.db.select().from(partnerAccounts).where(eq(partnerAccounts.userId, owner.userId));
    expect(account?.role).toBe('owner');
  });

  it('rejects a wrong code and counts the attempt', async () => {
    const challenge = await call<{ requestId: string }>(ctx, 'POST', '/auth/otp/request', {
      body: { channel: 'phone', phoneE164: '+919000000001' },
    });
    const real = ctx.otp.last.get('+919000000001')!;
    const wrong = real === '000000' ? '111111' : '000000';
    const res = await call<{ code: string }>(ctx, 'POST', '/auth/otp/verify', {
      body: { requestId: challenge.body.requestId, code: wrong },
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('auth.otp_invalid');
  });

  it('rejects requests without a valid token', async () => {
    const res = await call(ctx, 'GET', '/partner/me', { token: 'not-a-token' });
    expect(res.status).toBe(401);
  });

  it('rotates refresh tokens and revokes the session on reuse', async () => {
    const owner = await signInOwner(ctx);
    const first = await call<{ refreshToken: string; accessToken: string }>(ctx, 'POST', '/auth/refresh', {
      body: { refreshToken: owner.refreshToken },
    });
    expect(first.status).toBe(200);
    const reuse = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: owner.refreshToken } });
    expect(reuse.status).toBe(401);
    const afterReuse = await call(ctx, 'POST', '/auth/refresh', { body: { refreshToken: first.body.refreshToken } });
    expect(afterReuse.status).toBe(401);
    const me = await call(ctx, 'GET', '/partner/me', { token: first.body.accessToken });
    expect(me.status).toBe(401);
  });

  it('refuses legacy non-owner partner accounts and never upgrades them', async () => {
    // A legacy manager row (e.g. imported from the prototype) must not gain owner access.
    const [user] = await ctx.db.insert(users).values({ phoneE164: '+919000000002' }).returning();
    await ctx.db.insert(partnerAccounts).values({ userId: user!.id, role: 'manager_legacy' });
    const owner = await signInOwner(ctx, '+919000000002');
    const me = await call<{ code: string }>(ctx, 'GET', '/partner/me', { token: owner.token });
    expect(me.status).toBe(403);
    const [account] = await ctx.db.select().from(partnerAccounts).where(eq(partnerAccounts.userId, user!.id));
    expect(account?.role).toBe('manager_legacy');
  });

  it('ignores any role sent by the client at sign-in', async () => {
    const challenge = await call<{ requestId: string }>(ctx, 'POST', '/auth/otp/request', {
      body: { channel: 'phone', phoneE164: '+919000000003', role: 'manager' },
    });
    expect(challenge.status).toBe(200);
    const code = ctx.otp.last.get('+919000000003')!;
    const verified = await call<{ session: { user: { id: string } } }>(ctx, 'POST', '/auth/otp/verify', {
      body: { requestId: challenge.body.requestId, code, role: 'manager' },
    });
    expect(verified.status).toBe(200);
    const [account] = await ctx.db.select().from(partnerAccounts).where(eq(partnerAccounts.userId, verified.body.session.user.id));
    expect(account?.role).toBe('owner');
  });
});

describe('OTP resend cooldown', () => {
  it('stamps challenges with the application clock and enforces the 30 s cooldown on it', async () => {
    // Move the app clock far from the database's wall clock: the cooldown must follow the app clock.
    ctx.clock.set('2031-03-01T10:00:00.000Z');
    const phoneE164 = '+919000000004';
    const request = () =>
      call<{ requestId: string; code?: string }>(ctx, 'POST', '/auth/otp/request', {
        body: { channel: 'phone', phoneE164 },
      });

    const first = await request();
    expect(first.status).toBe(200);
    const [challenge] = await ctx.db.select().from(otpChallenges).where(eq(otpChallenges.id, first.body.requestId));
    expect(challenge?.createdAt.toISOString()).toBe('2031-03-01T10:00:00.000Z');

    expect((await request()).status).toBe(429);
    ctx.clock.advance(29_000);
    expect((await request()).status).toBe(429);
    ctx.clock.advance(2_000);
    expect((await request()).status).toBe(200);
  });
});
