/**
 * Web build stand-in for secure.ts, used ONLY by the browser design preview (`pnpm web`).
 * Browsers have no Keychain/Keystore, so this keeps values in sessionStorage for the tab's lifetime.
 * The shipped Android/iOS apps always use secure.ts (OS-encrypted storage); production builds never target web.
 */

const store = typeof sessionStorage !== 'undefined' ? sessionStorage : null;

export async function getRefreshToken(): Promise<string | null> {
  return store?.getItem('hg.refresh_token') ?? null;
}
export async function setRefreshToken(token: string): Promise<void> {
  store?.setItem('hg.refresh_token', token);
}
export async function clearRefreshToken(): Promise<void> {
  store?.removeItem('hg.refresh_token');
}
export async function getDeviceId(): Promise<string> {
  let id = store?.getItem('hg.device_id');
  if (!id) {
    id = 'web-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    store?.setItem('hg.device_id', id);
  }
  return id;
}
export async function getAppLock(): Promise<boolean> {
  return false;
}
export async function setAppLock(_on: boolean): Promise<void> {}
export async function clearLocalSettings(): Promise<void> {}
