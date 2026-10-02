import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Everything persisted by the app goes through the OS secure enclave:
 * iOS Keychain / Android Keystore-backed EncryptedSharedPreferences (AES-256-GCM).
 * Items are bound to this device and only readable while it is unlocked, and never
 * included in backups or migrated to another phone.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const KEYS = {
  refreshToken: 'hg.refresh_token',
  deviceId: 'hg.device_id',
  appLock: 'hg.app_lock',
} as const;

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.refreshToken, OPTIONS);
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.refreshToken, token, OPTIONS);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.refreshToken, OPTIONS);
}

/** A random install id (not a hardware identifier), used for per-device rate limits and session lists. */
export async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEYS.deviceId, OPTIONS);
  if (existing) return existing;
  const bytes = await Crypto.getRandomBytesAsync(16);
  const id = 'rn-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEYS.deviceId, id, OPTIONS);
  return id;
}

export async function getAppLock(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEYS.appLock, OPTIONS)) === '1';
}

export async function setAppLock(on: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEYS.appLock, on ? '1' : '0', OPTIONS);
}

/** On sign-out: forget per-rider settings so the next person on this phone starts clean. */
export async function clearLocalSettings(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.appLock, OPTIONS);
}
