import { z } from 'zod';

import { ApiError, createApiClient } from './client';
import { CouponInputSchema, SetPayoutAccountSchema } from './index';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const problem = (status: number, code: string, detail: string) => ({
  type: `https://docs.hungerly.app/errors/${code}`,
  title: detail,
  status,
  code,
  detail,
});

describe('createApiClient', () => {
  it('sends the bearer token and validates the response', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { ok: true }));
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1/',
      tokens: { getAccessToken: () => 'abc', refresh: async () => false },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.request('GET', '/health', { schema: z.object({ ok: z.boolean() }) });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/v1/health');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc');
  });

  it('refreshes once on 401 and retries', async () => {
    let token = 'old';
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, problem(401, 'unauthenticated', 'expired')))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      tokens: {
        getAccessToken: () => token,
        refresh: async () => {
          token = 'new';
          return true;
        },
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.request('GET', '/partner/me', { schema: z.object({ ok: z.boolean() }) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retried = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect((retried[1].headers as Record<string, string>).Authorization).toBe('Bearer new');
  });

  it('reports an expired session when refresh fails', async () => {
    const onSessionExpired = jest.fn();
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      tokens: { getAccessToken: () => 'x', refresh: async () => false },
      onSessionExpired,
      fetchImpl: (async () => jsonResponse(401, problem(401, 'unauthenticated', 'Please sign in again.'))) as unknown as typeof fetch,
    });
    await expect(client.request('GET', '/partner/me')).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('turns problem documents into ApiError with field errors', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      fetchImpl: (async () =>
        jsonResponse(422, { ...problem(422, 'validation', 'Some fields need attention.'), errors: { ifsc: ['Enter a valid IFSC'] } })) as unknown as typeof fetch,
    });
    const error = await client.request('POST', '/x', { body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fieldErrors.ifsc).toEqual(['Enter a valid IFSC']);
  });

  it('rejects responses that do not match the contract', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      fetchImpl: (async () => jsonResponse(200, { balance: 'lots' })) as unknown as typeof fetch,
    });
    await expect(client.request('GET', '/x', { schema: z.object({ balance: z.number() }) })).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('maps network failures to a friendly error', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.test/api/v1',
      fetchImpl: (async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
    });
    await expect(client.request('GET', '/x')).rejects.toMatchObject({ code: 'network', status: 0 });
  });
});

describe('contract schemas', () => {
  it('requires matching bank account numbers and a valid IFSC', () => {
    const base = { accountHolderName: 'Asha Foods', accountNumber: '123456789012', ifsc: 'hdfc0001234' };
    expect(SetPayoutAccountSchema.safeParse({ ...base, confirmAccountNumber: '123456789012' }).success).toBe(true);
    expect(SetPayoutAccountSchema.safeParse({ ...base, confirmAccountNumber: '123456789013' }).success).toBe(false);
    expect(SetPayoutAccountSchema.safeParse({ ...base, ifsc: 'HDFC1234', confirmAccountNumber: '123456789012' }).success).toBe(false);
  });

  it('normalises coupon codes and rejects negative amounts', () => {
    const coupon = {
      code: 'save20',
      title: 'Weekend treat',
      discount: { type: 'percent', percentBps: 2000, maxDiscountMinor: 10000 },
      minOrderMinor: 29900,
      startsAt: '2026-10-12T00:00:00.000Z',
      endsAt: '2026-10-19T00:00:00.000Z',
      usageLimitTotal: null,
      usageLimitPerCustomer: 1,
    };
    const parsed = CouponInputSchema.parse(coupon);
    expect(parsed.code).toBe('SAVE20');
    expect(CouponInputSchema.safeParse({ ...coupon, minOrderMinor: -1 }).success).toBe(false);
  });
});
