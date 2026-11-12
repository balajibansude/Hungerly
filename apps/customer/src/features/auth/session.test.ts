import type { Session } from '@hungerly/types';

import { setSessionExpiredHandler } from '@/lib/api';
import { getAccessToken, getStoredRefreshToken, storeTokens } from '@/lib/tokens';

import { entryRouteFor, handleSessionExpired, needsProfileSetup, useSessionStore } from './session';

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

// Capture the registration made when session.ts loads.
jest.mock('@/lib/api', () => ({ setSessionExpiredHandler: jest.fn() }));

const session = (fullName: string | null, isNewUser: boolean): Session => ({
  user: { id: 'u', phoneE164: '+919876543210', fullName, email: null },
  isNewUser,
});

describe('entryRouteFor', () => {
  it('opens Home for guests: no intro slides and no login wall', () => {
    expect(entryRouteFor({ session: null })).toBe('/home');
  });

  it('sends signed-in customers straight home', () => {
    expect(entryRouteFor({ session: session(null, false) })).toBe('/home');
    expect(entryRouteFor({ session: session('Aarav', true) })).toBe('/home');
  });
});

describe('needsProfileSetup', () => {
  it('asks only new users without a name', () => {
    expect(needsProfileSetup(session(null, true))).toBe(true);
    expect(needsProfileSetup(session('Aarav', true))).toBe(false);
    expect(needsProfileSetup(session(null, false))).toBe(false);
  });
});

describe('session store', () => {
  beforeEach(() => useSessionStore.setState({ session: null, pendingSession: null }));

  it('keeps a first-time sign-in pending until profile setup finishes', () => {
    const pending = session(null, true);
    useSessionStore.getState().beginProfileSetup(pending);
    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().pendingSession).toBe(pending);

    useSessionStore.getState().signIn({ ...pending, isNewUser: false });
    expect(useSessionStore.getState().session).not.toBeNull();
    expect(useSessionStore.getState().pendingSession).toBeNull();
  });

  it('returns to guest mode on sign-out', () => {
    useSessionStore.getState().signIn(session('Aarav', false));
    useSessionStore.getState().signOut();
    expect(useSessionStore.getState().session).toBeNull();
  });
});

describe('expired session handling', () => {
  const pair = { accessToken: 'access-1', refreshToken: `refresh-${'x'.repeat(24)}`, accessExpiresInSeconds: 900 };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('registers the handler with the API client exactly once', () => {
    expect(setSessionExpiredHandler).toHaveBeenCalledTimes(1);
    expect(setSessionExpiredHandler).toHaveBeenCalledWith(handleSessionExpired);
  });

  it('resets the store to a guest, including a pending profile setup', () => {
    useSessionStore.setState({ session: session('Aarav', false), pendingSession: session(null, true) });
    handleSessionExpired();
    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().pendingSession).toBeNull();
  });

  it('forgets tokens locally without making any request', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('no network calls expected');
    });
    await storeTokens(pair);
    handleSessionExpired();
    await flush();
    expect(getAccessToken()).toBeNull();
    expect(await getStoredRefreshToken()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('keeps the restore flag so the app does not show the splash again', () => {
    useSessionStore.setState({ isRestored: true, session: session('Aarav', false) });
    handleSessionExpired();
    expect(useSessionStore.getState().isRestored).toBe(true);
  });
});
