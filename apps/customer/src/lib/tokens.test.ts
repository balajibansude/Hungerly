import * as SecureStore from 'expo-secure-store';

import {
  clearTokens,
  getAccessToken,
  getStoredRefreshToken,
  hasStoredSession,
  REFRESH_TOKEN_KEY,
  storeTokens,
} from './tokens';

// In-memory stand-in for the device keychain (same approach as the restaurant app's tests).
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

const mocked = SecureStore as jest.Mocked<typeof SecureStore>;
const pair = { accessToken: 'access-1', refreshToken: 'refresh-1', accessExpiresInSeconds: 900 };

beforeEach(async () => {
  await clearTokens();
  mockStore.clear();
  jest.clearAllMocks();
});

describe('customer tokens', () => {
  it('uses the customer-specific key', () => {
    expect(REFRESH_TOKEN_KEY).toBe('swaadone.customer.refreshToken');
  });

  it('keeps the access token in memory and only the refresh token in secure storage', async () => {
    await storeTokens(pair);
    expect(getAccessToken()).toBe('access-1');
    expect(mocked.setItemAsync).toHaveBeenCalledTimes(1);
    expect(mocked.setItemAsync).toHaveBeenCalledWith(REFRESH_TOKEN_KEY, 'refresh-1');
    expect([...mockStore.values()]).toEqual(['refresh-1']);
  });

  it('replaces both tokens when a rotated pair is stored', async () => {
    await storeTokens(pair);
    await storeTokens({ ...pair, accessToken: 'access-2', refreshToken: 'refresh-2' });
    expect(getAccessToken()).toBe('access-2');
    expect(await getStoredRefreshToken()).toBe('refresh-2');
  });

  it('reports whether a session is stored', async () => {
    expect(await hasStoredSession()).toBe(false);
    await storeTokens(pair);
    expect(await hasStoredSession()).toBe(true);
  });

  it('clears the in-memory and stored tokens', async () => {
    await storeTokens(pair);
    await clearTokens();
    expect(getAccessToken()).toBeNull();
    expect(await getStoredRefreshToken()).toBeNull();
    expect(mocked.deleteItemAsync).toHaveBeenCalledWith(REFRESH_TOKEN_KEY);
  });

  it('treats unreadable storage as no session', async () => {
    mocked.getItemAsync.mockRejectedValueOnce(new Error('keychain locked'));
    expect(await getStoredRefreshToken()).toBeNull();
  });

  it('still forgets the access token when deleting from storage fails', async () => {
    await storeTokens(pair);
    mocked.deleteItemAsync.mockRejectedValueOnce(new Error('keychain locked'));
    await expect(clearTokens()).resolves.toBeUndefined();
    expect(getAccessToken()).toBeNull();
  });
});
