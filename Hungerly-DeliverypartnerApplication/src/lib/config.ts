import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; appEnv?: string };

export const APP_ENV = extra.appEnv === 'production' ? 'production' : 'development';
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/**
 * Development: unless EXPO_PUBLIC_API_URL names a server, go through the Metro dev server the app was
 * loaded from (metro.config.js forwards /api to the local API). Works on any Wi-Fi, no firewall rule.
 */
function devServerOrigin(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.0.105:8082"
  return hostUri ? `http://${hostUri.split('/')[0]}` : null;
}

function resolveApiBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl;
  const viaMetro = APP_ENV !== 'production' && (!configured || configured === 'metro') ? devServerOrigin() : null;
  // Last-resort development fallback: the Android emulator reaches the host machine on 10.0.2.2.
  const raw = viaMetro ?? (configured && configured !== 'metro' ? configured : Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000');
  const url = raw.replace(/\/+$/, '');
  if (APP_ENV === 'production' && !url.startsWith('https://')) {
    // A production build must never send tokens or rider data over plain HTTP.
    throw new Error('EXPO_PUBLIC_API_URL must use https:// in production builds');
  }
  return `${url}/api/v1`;
}

export const API_BASE = resolveApiBase();

/** Support line shown in the app (call centre). */
export const SUPPORT_PHONE = '+912071177117';
