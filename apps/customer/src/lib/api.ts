import { createApiClient, isApiError, paths, TokenPairSchema, type ApiClient } from '@hungerly/api-client';

import { clearTokens, getAccessToken, getStoredRefreshToken, storeTokens } from './tokens';

/**
 * The customer app's REST client for the Swaadone API (same model as the restaurant app's
 * `lib/api.ts`). Screens never use it directly: they go through `services/contracts.ts`.
 *
 * Mock mode: when no API URL is configured (or EXPO_PUBLIC_USE_MOCK=true) the app keeps
 * running on the existing mock services, so this client must never be called. There is no
 * second mock backend here — any call in mock mode fails loudly instead.
 */

/** Pure so it can be tested; the app's values are read below. */
export function isMockMode(env: { apiUrl?: string; useMock?: string }): boolean {
  return !env.apiUrl?.trim() || env.useMock === 'true';
}

// `process.env.EXPO_PUBLIC_*` must be read literally so Expo can inline the values.
/** API base URL including `/api/v1`, from `EXPO_PUBLIC_API_URL` (see .env.example). */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || null;

export const IS_MOCK_MODE = isMockMode({
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  useMock: process.env.EXPO_PUBLIC_USE_MOCK,
});

export interface CustomerApi {
  api: ApiClient;
  /**
   * Exchanges the stored refresh token for a new pair. Resolves false when there is no
   * session or the server rejected it (tokens are then cleared). Throws on network/server
   * failures so a temporary outage never signs the customer out.
   */
  refreshTokens(): Promise<boolean>;
  /** Registers what to do when the session cannot be renewed (the session store signs out). */
  setSessionExpiredHandler(handler: (() => void) | null): void;
}

export function createCustomerApi(options: { baseUrl: string; fetchImpl?: typeof fetch }): CustomerApi {
  let refreshInFlight: Promise<boolean> | null = null;
  let onExpired: (() => void) | null = null;

  async function doRefresh(): Promise<boolean> {
    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) return false;
    try {
      const tokens = await client.request('POST', paths.customer.auth.refresh, {
        body: { refreshToken },
        schema: TokenPairSchema,
        anonymous: true,
      });
      await storeTokens(tokens);
      return true;
    } catch (error) {
      // Only a definite rejection ends the session. Returning false lets the client fire
      // `onSessionExpired`; network errors and 5xx are rethrown and keep the stored token.
      if (isApiError(error) && error.status === 401) {
        await clearTokens();
        return false;
      }
      throw error;
    }
  }

  /** One refresh at a time: concurrent callers share it (refresh tokens are single use). */
  function sharedRefresh(): Promise<boolean> {
    refreshInFlight ??= doRefresh().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  const client: ApiClient = createApiClient({
    baseUrl: options.baseUrl,
    fetchImpl: options.fetchImpl,
    tokens: { getAccessToken, refresh: sharedRefresh },
    onSessionExpired: () => onExpired?.(),
  });

  return {
    api: client,
    refreshTokens: sharedRefresh,
    setSessionExpiredHandler: (handler) => {
      onExpired = handler;
    },
  };
}

const rejectInMockMode: typeof fetch = () =>
  Promise.reject(new Error('The API is disabled in mock mode (EXPO_PUBLIC_API_URL is not set).'));

const customerApi = createCustomerApi({
  baseUrl: API_BASE_URL ?? 'http://mock.swaadone.invalid/api/v1',
  fetchImpl: IS_MOCK_MODE ? rejectInMockMode : undefined,
});

export const api = customerApi.api;
export const setSessionExpiredHandler = customerApi.setSessionExpiredHandler;

/** At startup: exchanges the stored refresh token for an access token. */
export function restoreTokens(): Promise<boolean> {
  return customerApi.refreshTokens();
}
