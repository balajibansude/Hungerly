import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { requireCustomer } from '../src/auth/guard';
import { authSessions, users } from '../src/db/schema';
import { AppError } from '../src/lib/errors';
import { call, createTestContext, signInAdmin, signInOwner, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

/** No customer route exists yet, so the guard is called with a minimal request on the real app. */
function requestWith(token?: string): FastifyRequest {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    server: ctx.app,
  } as unknown as FastifyRequest;
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (error) {
    if (error instanceof AppError) return error.status;
    throw error;
  }
}

let counter = 0;
async function signInCustomer() {
  const phoneE164 = `+9196${String(30_000_000 + (counter += 1) * 4513).slice(-8)}`;
  const challenge = await call<{ requestId: string }>(ctx, 'POST', '/auth/otp/request', {
    body: { channel: 'phone', phoneE164 },
  });
  const res = await call<{ tokens: { accessToken: string }; customer: { user: { id: string } } }>(
    ctx,
    'POST',
    '/customer/auth/otp/verify',
    { body: { requestId: challenge.body.requestId, code: ctx.otp.last.get(phoneE164)! } },
  );
  expect(res.status).toBe(200);
  return { token: res.body.tokens.accessToken, userId: res.body.customer.user.id };
}

describe('requireCustomer', () => {
  it('accepts a valid customer session', async () => {
    const customer = await signInCustomer();
    const auth = await requireCustomer(requestWith(customer.token));
    expect(auth.userId).toBe(customer.userId);
    const [session] = await ctx.db.select().from(authSessions).where(eq(authSessions.id, auth.sessionId));
    expect(session?.audience).toBe('customer');
  });

  it('rejects partner sessions', async () => {
    const owner = await signInOwner(ctx);
    expect(await statusOf(requireCustomer(requestWith(owner.token)))).toBe(401);
  });

  it('rejects admin sessions', async () => {
    const admin = await signInAdmin(ctx);
    expect(await statusOf(requireCustomer(requestWith(admin.token)))).toBe(401);
  });

  it('rejects missing and malformed tokens', async () => {
    expect(await statusOf(requireCustomer(requestWith()))).toBe(401);
    expect(await statusOf(requireCustomer(requestWith('not-a-token')))).toBe(401);
  });

  it('rejects revoked and expired customer sessions', async () => {
    const revoked = await signInCustomer();
    const { sessionId } = await requireCustomer(requestWith(revoked.token));
    await ctx.db.update(authSessions).set({ revokedAt: ctx.clock.now }).where(eq(authSessions.id, sessionId));
    expect(await statusOf(requireCustomer(requestWith(revoked.token)))).toBe(401);

    const expired = await signInCustomer();
    const auth = await requireCustomer(requestWith(expired.token));
    await ctx.db
      .update(authSessions)
      .set({ expiresAt: new Date(ctx.clock.now.getTime() - 1_000) })
      .where(eq(authSessions.id, auth.sessionId));
    expect(await statusOf(requireCustomer(requestWith(expired.token)))).toBe(401);
  });

  it('refuses inactive customers', async () => {
    const customer = await signInCustomer();
    await ctx.db.update(users).set({ status: 'suspended' }).where(eq(users.id, customer.userId));
    expect(await statusOf(requireCustomer(requestWith(customer.token)))).toBe(403);
  });

  it('leaves partner authentication unchanged: customer tokens still fail partner routes', async () => {
    const customer = await signInCustomer();
    const me = await call(ctx, 'GET', '/partner/me', { token: customer.token });
    expect(me.status).toBe(401);
  });
});
