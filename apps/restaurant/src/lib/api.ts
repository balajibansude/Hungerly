import {
  createApiClient,
  paths,
  TokenPairSchema,
  type ApiClient,
  type TokenPair,
} from '@hungerly/api-client';
import * as SecureStore from 'expo-secure-store';

import { mockFetch } from './mockFetch';

/**
 * The single REST client for the app. Every screen talks to the Swaadone API through it
 * (via the hooks in `@/lib/hooks`); there is no mock data path.
 *
 * Tokens: the short-lived access token stays in memory; the refresh token is kept in the
 * device keychain/keystore (expo-secure-store) so the session survives restarts. Each
 * refresh rotates it (the server detects reuse).
 */

/** API base URL including `/api/v1`, from `EXPO_PUBLIC_API_URL` (see README). */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? null;

const REFRESH_KEY = 'swaadone.partner.refreshToken';

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onExpired: (() => void) | null = null;

export async function storeTokens(tokens: TokenPair): Promise<void> {
  accessToken = tokens.accessToken;
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => undefined);
}

export async function hasStoredSession(): Promise<boolean> {
  return (await SecureStore.getItemAsync(REFRESH_KEY)) !== null;
}

/** Registers what to do when the session cannot be renewed (the session store signs out). */
export function setSessionExpiredHandler(handler: () => void): void {
  onExpired = handler;
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const tokens = await client.request('POST', paths.auth.refresh, {
      body: { refreshToken },
      schema: TokenPairSchema,
      anonymous: true,
    });
    await storeTokens(tokens);
    return true;
  } catch (error) {
    // Only a definite rejection ends the session; offline keeps the stored token.
    if ((error as { status?: number }).status === 401) await clearTokens();
    return false;
  }
}

/** True when no real backend URL is configured, or when EXPO_PUBLIC_USE_MOCK=true. */
export const IS_PROTOTYPE_MODE =
  !API_BASE_URL || process.env.EXPO_PUBLIC_USE_MOCK === 'true';

const client: ApiClient = createApiClient({
  baseUrl: API_BASE_URL ?? 'http://prototype.swaadone.invalid/api/v1',
  fetchImpl: IS_PROTOTYPE_MODE ? mockFetch : undefined,
  tokens: {
    getAccessToken: () => accessToken,
    refresh: () => {
      refreshInFlight ??= refreshTokens().finally(() => {
        refreshInFlight = null;
      });
      return refreshInFlight;
    },
  },
  onSessionExpired: () => onExpired?.(),
});

export const api = client;

/** Exchanges the stored refresh token for an access token at startup. */
export function restoreTokens(): Promise<boolean> {
  return refreshTokens();
}
