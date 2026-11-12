import { isServiceError, userMessage } from '@hungerly/app-core';
import { ApiError, paths } from '@hungerly/api-client';

import { createCustomerApi } from '@/lib/api';
import { clearTokens, getAccessToken, getStoredRefreshToken, storeTokens } from '@/lib/tokens';

import { createApiAuthService, toServiceError } from './auth';

// In-memory stand-in for the device keychain (same approach as lib/tokens.test.ts).
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

const BASE = 'https://api.test/api/v1';
const url = (path: string) => `${BASE}${path}`;
const USER_ID = '00000000-0000-4000-8000-0000000000c1';
const REQUEST_ID = '00000000-0000-4000-8000-0000000000d1';
const PHONE = '+919876543210';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string, detail = code, errors?: Record<string, string[]>) =>
  json(status, { type: 'about:blank', title: code, status, code, detail, ...(errors ? { errors } : {}) });

const pair = (n: number) => ({
  accessToken: `access-${n}`,
  refreshToken: `refresh-token-${n}-${'x'.repeat(24)}`,
  accessExpiresInSeconds: 900,
});
const profile = (fullName: string | null = null) => ({ id: USER_ID, fullName, phoneE164: PHONE, email: null });

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function setup(handler: Handler) {
  const fetchImpl = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {})),
  );
  const customer = createCustomerApi({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
  const auth = createApiAuthService({ api: customer.api, restoreTokens: customer.refreshTokens });
  const calls = (target: string) => fetchImpl.mock.calls.filter(([u]) => String(u) === url(target));
  const bodyOf = (target: string) => JSON.parse(String(calls(target)[0]![1]!.body)) as unknown;
  return { auth, fetchImpl, calls, bodyOf };
}

const bearer = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

beforeEach(async () => {
  await clearTokens();
  mockStore.clear();
});

describe('requestOtp', () => {
  it('uses the shared OTP endpoint and returns the contract fields only', async () => {
    const { auth, bodyOf, calls } = setup(() =>
      json(200, { requestId: REQUEST_ID, expiresInSeconds: 300, resendAfterSeconds: 30, devDelivery: 'server_log' }),
    );
    await expect(auth.requestOtp(PHONE)).resolves.toEqual({
      requestId: REQUEST_ID,
      expiresInSeconds: 300,
      resendAfterSeconds: 30,
    });
    expect(bodyOf(paths.auth.otpRequest)).toEqual({ channel: 'phone', phoneE164: PHONE });
    expect(bearer(calls(paths.auth.otpRequest)[0]![1]!)).toBeUndefined();
  });

  it('keeps the server’s rate-limit message', async () => {
    const { auth } = setup(() => problem(429, 'rate_limited', 'Please wait a few seconds before asking for a new code.'));
    const error = await auth.requestOtp(PHONE).catch((e: unknown) => e);
    expect(isServiceError(error) && error.code).toBe('auth.otp_rate_limited');
    expect(userMessage(error)).toBe('Please wait a few seconds before asking for a new code.');
  });
});

describe('verifyOtp', () => {
  it('verifies at the customer endpoint and stores tokens before returning the session', async () => {
    const { auth, bodyOf } = setup(() => json(200, { tokens: pair(1), customer: { user: profile(), isNewUser: true } }));
    const session = await auth.verifyOtp(REQUEST_ID, '123456');
    expect(session).toEqual({
      user: { id: USER_ID, phoneE164: PHONE, fullName: null, email: null },
      isNewUser: true,
    });
    expect(bodyOf(paths.customer.auth.otpVerify)).toEqual({ requestId: REQUEST_ID, code: '123456' });
    expect(getAccessToken()).toBe('access-1');
    expect(await getStoredRefreshToken()).toBe(pair(1).refreshToken);
  });

  it('shows the server’s OTP message and stores nothing on a wrong code', async () => {
    const { auth } = setup(() => problem(401, 'auth.otp_invalid', 'That code is not right. Check it and try again.'));
    const error = await auth.verifyOtp(REQUEST_ID, '000000').catch((e: unknown) => e);
    expect(isServiceError(error) && error.code).toBe('auth.otp_invalid');
    expect(userMessage(error)).toBe('That code is not right. Check it and try again.');
    expect(await getStoredRefreshToken()).toBeNull();
  });
});

describe('restoreSession', () => {
  it('returns null without any request when nothing is stored', async () => {
    const { auth, fetchImpl } = setup(() => json(500, {}));
    await expect(auth.restoreSession()).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refreshes, then loads the profile from /customer/me', async () => {
    await storeTokens(pair(1));
    const { auth, calls } = setup((target) =>
      target === url(paths.customer.auth.refresh) ? json(200, pair(2)) : json(200, profile('Asha Rao')),
    );
    await expect(auth.restoreSession()).resolves.toEqual({
      user: { id: USER_ID, phoneE164: PHONE, fullName: 'Asha Rao', email: null },
      isNewUser: false,
    });
    expect(bearer(calls(paths.customer.me)[0]![1]!)).toBe('Bearer access-2');
  });

  it('flags a profile without a name for setup', async () => {
    await storeTokens(pair(1));
    const { auth } = setup((target) =>
      target === url(paths.customer.auth.refresh) ? json(200, pair(2)) : json(200, profile(null)),
    );
    expect((await auth.restoreSession())?.isNewUser).toBe(true);
  });

  it('returns null and clears tokens when the refresh is rejected', async () => {
    await storeTokens(pair(1));
    const { auth } = setup(() => problem(401, 'auth.session_expired'));
    await expect(auth.restoreSession()).resolves.toBeNull();
    expect(await getStoredRefreshToken()).toBeNull();
  });

  it('returns null and clears tokens when the account is refused', async () => {
    await storeTokens(pair(1));
    const { auth } = setup((target) =>
      target === url(paths.customer.auth.refresh) ? json(200, pair(2)) : problem(403, 'forbidden'),
    );
    await expect(auth.restoreSession()).resolves.toBeNull();
    expect(await getStoredRefreshToken()).toBeNull();
  });

  it.each([
    ['refresh', 'network', () => Promise.reject(new TypeError('Network request failed'))],
    ['refresh', '5xx', () => problem(503, 'unavailable')],
  ])('keeps the stored session when the %s fails with %s', async (_step, _kind, failure) => {
    await storeTokens(pair(1));
    const { auth } = setup(() => failure());
    await expect(auth.restoreSession()).rejects.toBeDefined();
    expect(await getStoredRefreshToken()).toBe(pair(1).refreshToken);
  });

  it('keeps the stored session when /customer/me fails with a 5xx', async () => {
    await storeTokens(pair(1));
    const { auth } = setup((target) =>
      target === url(paths.customer.auth.refresh) ? json(200, pair(2)) : problem(500, 'internal'),
    );
    const error = await auth.restoreSession().catch((e: unknown) => e);
    expect(isServiceError(error)).toBe(true);
    expect(await getStoredRefreshToken()).toBe(pair(2).refreshToken);
  });
});

describe('updateProfile', () => {
  it('sends only the name and returns the updated user', async () => {
    await storeTokens(pair(1));
    const { auth, bodyOf } = setup(() => json(200, profile('Asha Rao')));
    const user = await auth.updateProfile({ fullName: 'Asha Rao', email: 'asha@example.com' });
    expect(bodyOf(paths.customer.me)).toEqual({ fullName: 'Asha Rao' });
    expect(user).toEqual({ id: USER_ID, phoneE164: PHONE, fullName: 'Asha Rao', email: null });
  });

  it('shows the first field validation message', async () => {
    await storeTokens(pair(1));
    const { auth } = setup(() =>
      problem(422, 'validation', 'Some fields need attention.', { fullName: ['Too small: expected at least 2 characters'] }),
    );
    const error = await auth.updateProfile({ fullName: 'A' }).catch((e: unknown) => e);
    expect(isServiceError(error) && error.code).toBe('validation');
    expect(userMessage(error)).toBe('Too small: expected at least 2 characters');
  });
});

describe('signOut', () => {
  it('revokes the session on the server and clears local tokens', async () => {
    await storeTokens(pair(1));
    const { auth, calls } = setup(() => json(200, { ok: true }));
    await auth.signOut();
    expect(bearer(calls(paths.customer.auth.logout)[0]![1]!)).toBe('Bearer access-1');
    expect(getAccessToken()).toBeNull();
    expect(await getStoredRefreshToken()).toBeNull();
  });

  it('still clears local tokens when the network request fails', async () => {
    await storeTokens(pair(1));
    const { auth } = setup(() => Promise.reject(new TypeError('Network request failed')));
    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(getAccessToken()).toBeNull();
    expect(await getStoredRefreshToken()).toBeNull();
  });
});

describe('requestAccountDeletion', () => {
  it('refuses without calling the API', async () => {
    const { auth, fetchImpl } = setup(() => json(200, { ok: true }));
    const error = await auth.requestAccountDeletion().catch((e: unknown) => e);
    expect(isServiceError(error)).toBe(true);
    expect(userMessage(error)).toMatch(/nothing was deleted/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('toServiceError', () => {
  it('maps network failures and passes non-API errors through', () => {
    const network = toServiceError(new ApiError(0, 'network', 'Could not reach the server. Check your connection.'));
    expect(isServiceError(network) && network.code).toBe('network');
    const other = new Error('boom');
    expect(toServiceError(other)).toBe(other);
  });
});
