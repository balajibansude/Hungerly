import { Platform } from 'react-native';

import { API_BASE, APP_ENV, APP_VERSION } from './config';
import { clearRefreshToken, getRefreshToken, setRefreshToken } from './secure';

/**
 * HTTP client.
 * - Access token: memory only, 15-minute life.
 * - Refresh token: OS secure storage, rotated on every use (the server revokes the session if an old one
 *   is ever replayed, so concurrent refreshes are collapsed into one in-flight request).
 * - Every request has a timeout and carries no secrets other than the bearer token.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

interface TokenResponse {
  access_token: string;
  access_token_expires_in: number;
  refresh_token: string;
  user: { id: string; full_name: string | null; roles: string[]; is_new_user: boolean };
}

let accessToken: string | null = null;
let accessExpiresAt = 0;
let inflight: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(fn: () => void): void {
  onSessionLost = fn;
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

export async function acceptTokens(res: TokenResponse): Promise<void> {
  accessToken = res.access_token;
  accessExpiresAt = Date.now() + (res.access_token_expires_in - 30) * 1000;
  await setRefreshToken(res.refresh_token);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  accessExpiresAt = 0;
  await clearRefreshToken();
}

const MESSAGES: Record<number, string> = {
  401: 'Your session has ended. Please sign in again.',
  403: "You can't do that right now.",
  404: 'This is no longer available.',
  409: 'This changed in the meantime. Please refresh.',
  410: 'This offer has expired.',
  429: 'Too many attempts. Please wait a moment.',
  503: 'Service is busy. Please try again shortly.',
};

async function toError(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  const code = typeof body.code === 'string' ? body.code : `http.${res.status}`;
  const message =
    (typeof body.detail === 'string' && body.detail) ||
    (Array.isArray(body.errors) && body.errors.length ? 'Please check the details you entered.' : '') ||
    MESSAGES[res.status] ||
    'Something went wrong. Please try again.';
  return new ApiError(res.status, code, message, body);
}

async function rawFetch(path: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'X-Client-App': 'delivery',
        'X-Client-Version': APP_VERSION,
        'X-Platform': Platform.OS,
        ...(init.headers as Record<string, string>),
      },
    });
  } catch {
    const msg = controller.signal.aborted ? 'The server took too long to respond.' : "You're offline. Check your connection.";
    // In development, say which server the app tried, so a wrong/unreachable API URL is obvious.
    throw new ApiError(0, 'network.offline', APP_ENV === 'production' ? msg : `${msg}\n(Can't reach ${API_BASE.replace('/api/v1', '')})`);
  } finally {
    clearTimeout(timer);
  }
}

/** Rotate the refresh token. Returns false when the session is gone (signed out elsewhere, revoked, expired). */
export function refreshTokens(): Promise<boolean> {
  if (!inflight) {
    inflight = (async () => {
      try {
        const token = await getRefreshToken();
        if (!token) return false;
        const res = await rawFetch('/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: token, client_app: 'delivery' }),
        });
        if (res.status === 401) {
          await clearTokens();
          return false;
        }
        if (!res.ok) throw await toError(res);
        await acceptTokens((await res.json()) as TokenResponse);
        return true;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  auth?: boolean;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const auth = opts.auth !== false;
  if (auth && (!accessToken || Date.now() > accessExpiresAt)) {
    if (!(await refreshTokens())) {
      onSessionLost?.();
      throw new ApiError(401, 'auth.session_revoked', MESSAGES[401]!);
    }
  }
  const qs = Object.entries(opts.query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const send = () =>
    rawFetch(qs ? `${path}?${qs}` : path, {
      method: opts.method ?? 'GET',
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

  let res = await send();
  if (res.status === 401 && auth) {
    if (await refreshTokens()) {
      res = await send();
    } else {
      onSessionLost?.();
    }
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 202 || res.status === 204) {
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  return (await res.json()) as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  // Our own thrown errors (location, permissions) carry a user-facing message; show it instead of a generic one.
  if (e instanceof Error && e.message && e.message.length < 200) return e.message;
  return 'Something went wrong. Please try again.';
}
