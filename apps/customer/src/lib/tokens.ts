import type { TokenPair } from '@hungerly/api-client';
import * as SecureStore from 'expo-secure-store';

/**
 * Customer session tokens (same model as the restaurant app's `lib/api.ts`):
 *
 * - The short-lived access token lives only in memory and is gone after a restart.
 * - The refresh token is kept in the device keychain/keystore (expo-secure-store) so the
 *   session survives restarts. Every refresh rotates it; callers store the new pair.
 *
 * The key is customer-specific so it can never be confused with the partner app's token.
 */
export const REFRESH_TOKEN_KEY = 'swaadone.customer.refreshToken';

let accessToken: string | null = null;

/** Saves a new token pair: access token in memory, refresh token in secure storage. */
export async function storeTokens(tokens: TokenPair): Promise<void> {
  accessToken = tokens.accessToken;
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

/** The in-memory access token, or null before sign-in/refresh or after a restart. */
export function getAccessToken(): string | null {
  return accessToken;
}

/** The stored refresh token, or null when there is none or storage cannot be read. */
export async function getStoredRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** True when a refresh token is stored, i.e. a previous session may be restored. */
export async function hasStoredSession(): Promise<boolean> {
  return (await getStoredRefreshToken()) !== null;
}

/** Forgets both tokens. Never throws: a failed delete must not block signing out. */
export async function clearTokens(): Promise<void> {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => undefined);
}
