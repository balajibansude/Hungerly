import { isApiError, OkSchema as Ok, paths } from '@hungerly/api-client';

import { createCustomerApi, isMockMode } from './api';
import { clearTokens, getAccessToken, getStoredRefreshToken, storeTokens } from './tokens';

// In-memory stand-in for the device keychain (same approach as tokens.test.ts).
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
const REFRESH_URL = `${BASE}${paths.customer.auth.refresh}`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: code, status, code, detail: code });

/** A pair whose refresh token is a realistic length. */
const pair = (n: number) => ({
  accessToken: `access-${n}`,
  refreshToken: `refresh-token-${n}-${'x'.repeat(24)}`,
  accessExpiresInSeconds: 900,
});

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function setup(handler: Handler) {
  const fetchImpl = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {})),
  );
  const expired = jest.fn();
  const customer = createCustomerApi({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
  customer.setSessionExpiredHandler(expired);
  const calls = (url: string) => fetchImpl.mock.calls.filter(([u]) => String(u) === url);
  return { ...customer, fetchImpl, expired, calls };
}

const bearer = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

beforeEach(async () => {
  await clearTokens();
  mockStore.clear();
});

describe('customer API client', () => {
  it('sends the in-memory access token as a bearer token', async () => {
    await storeTokens(pair(1));
    const { api, fetchImpl } = setup(() => json(200, { ok: true }));
    await api.request('GET', '/customer/anything', { schema: Ok });
    expect(bearer(fetchImpl.mock.calls[0]![1]!)).toBe('Bearer access-1');
  });

  it('refreshes on 401, stores the rotated pair and retries with the new token', async () => {
    await storeTokens(pair(1));
    const { api, calls, expired } = setup((url, init) => {
      if (url === REFRESH_URL) return json(200, pair(2));
      return bearer(init) === 'Bearer access-2' ? json(200, { ok: true }) : problem(401, 'unauthenticated');
    });

    await expect(api.request('GET', '/customer/anything', { schema: Ok })).resolves.toEqual({ ok: true });

    const [refreshCall] = calls(REFRESH_URL);
    expect(refreshCall?.[1]?.method).toBe('POST');
    expect(bearer(refreshCall![1]!)).toBeUndefined(); // refresh is anonymous
    expect(JSON.parse(String(refreshCall![1]!.body))).toEqual({ refreshToken: pair(1).refreshToken });
    expect(getAccessToken()).toBe('access-2');
    expect(await getStoredRefreshToken()).toBe(pair(2).refreshToken);
    expect(expired).not.toHaveBeenCalled();
  });

  it('clears tokens and reports an expired session when refresh is rejected', async () => {
    await storeTokens(pair(1));
    const { api, expired } = setup((url) =>
      url === REFRESH_URL ? problem(401, 'auth.session_expired') : problem(401, 'unauthenticated'),
    );

    const error = await api.request('GET', '/customer/anything', { schema: Ok }).catch((e: unknown) => e);
    expect(isApiError(error) && error.status).toBe(401);
    expect(getAccessToken()).toBeNull();
    expect(await getStoredRefreshToken()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a network error', () => Promise.reject(new TypeError('Network request failed'))],
    ['a 5xx response', () => problem(503, 'unavailable')],
  ])('keeps the session when refresh fails with %s', async (_label, refreshResponse) => {
    await storeTokens(pair(1));
    const { api, expired } = setup((url) =>
      url === REFRESH_URL ? refreshResponse() : problem(401, 'unauthenticated'),
    );

    await expect(api.request('GET', '/customer/anything', { schema: Ok })).rejects.toBeDefined();
    expect(await getStoredRefreshToken()).toBe(pair(1).refreshToken);
    expect(getAccessToken()).toBe('access-1');
    expect(expired).not.toHaveBeenCalled();
  });

  it('shares one refresh between concurrent 401s', async () => {
    await storeTokens(pair(1));
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const { api, calls } = setup(async (url, init) => {
      if (url === REFRESH_URL) {
        await refreshGate;
        return json(200, pair(2));
      }
      return bearer(init) === 'Bearer access-2' ? json(200, { ok: true }) : problem(401, 'unauthenticated');
    });

    const requests = [1, 2, 3].map(() => api.request('GET', '/customer/anything', { schema: Ok }));
    // Let every request hit its 401 before the single refresh completes.
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseRefresh();

    await expect(Promise.all(requests)).resolves.toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(calls(REFRESH_URL)).toHaveLength(1);
  });

  it('does not call the refresh endpoint without a stored refresh token', async () => {
    const { api, calls, expired } = setup(() => problem(401, 'unauthenticated'));
    await expect(api.request('GET', '/customer/anything', { schema: Ok })).rejects.toBeDefined();
    expect(calls(REFRESH_URL)).toHaveLength(0);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('restores a session at startup through refreshTokens()', async () => {
    await storeTokens(pair(1));
    await clearTokensFromMemoryOnly();
    const { refreshTokens } = setup((url) => (url === REFRESH_URL ? json(200, pair(2)) : json(404, {})));
    await expect(refreshTokens()).resolves.toBe(true);
    expect(getAccessToken()).toBe('access-2');
  });
});

describe('isMockMode', () => {
  it('uses mock services when no API URL is configured', () => {
    expect(isMockMode({})).toBe(true);
    expect(isMockMode({ apiUrl: '' })).toBe(true);
    expect(isMockMode({ apiUrl: '   ' })).toBe(true);
  });

  it('uses the real API when a URL is set and mock mode is not forced', () => {
    expect(isMockMode({ apiUrl: BASE })).toBe(false);
    expect(isMockMode({ apiUrl: BASE, useMock: 'false' })).toBe(false);
  });

  it('forces mock services with EXPO_PUBLIC_USE_MOCK=true', () => {
    expect(isMockMode({ apiUrl: BASE, useMock: 'true' })).toBe(true);
  });
});

/** Simulates an app restart: the access token is gone, the keychain still has the refresh token. */
async function clearTokensFromMemoryOnly() {
  const stored = await getStoredRefreshToken();
  await clearTokens();
  if (stored) mockStore.set('swaadone.customer.refreshToken', stored);
}
