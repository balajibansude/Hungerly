/**
 * API client.
 *
 * Security model: the access token lives only in memory (never localStorage). The refresh token is an
 * HttpOnly, SameSite=Strict cookie the page cannot read; refreshing also requires the double-submit CSRF
 * token. Requests are same-origin (`/api`), so no credentials are ever sent to another site.
 */

export const API = '/api/v1';

export interface AdminUser {
  id: string;
  full_name: string | null;
  roles: string[];
  admin_role: 'super_admin' | 'operations' | 'support' | 'finance' | null;
}

interface TokenResponse {
  access_token: string;
  access_token_expires_in: number;
  user: AdminUser;
}

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

type Listener = (user: AdminUser | null) => void;

let accessToken: string | null = null;
let currentUser: AdminUser | null = null;
let refreshTimer: number | undefined;
let inflightRefresh: Promise<boolean> | null = null;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getUser(): AdminUser | null {
  return currentUser;
}

function setSession(res: TokenResponse | null): void {
  window.clearTimeout(refreshTimer);
  accessToken = res?.access_token ?? null;
  currentUser = res?.user ?? null;
  if (res) {
    // Refresh a minute before the 15-minute access token expires.
    const ms = Math.max(30, res.access_token_expires_in - 60) * 1000;
    refreshTimer = window.setTimeout(() => void refreshSession(), ms);
  }
  listeners.forEach((fn) => fn(currentUser));
}

export function acceptSession(res: TokenResponse): void {
  setSession(res);
}

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function csrfToken(): string | null {
  return readCookie('__Host-hg_csrf') ?? readCookie('hg_csrf');
}

async function parseError(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  const code = typeof body.code === 'string' ? body.code : `http.${res.status}`;
  const message =
    (typeof body.detail === 'string' && body.detail) ||
    (Array.isArray(body.errors) && body.errors.length
      ? String((body.errors[0] as { message?: string }).message ?? 'Please check the form.')
      : null) ||
    FALLBACK_MESSAGES[res.status] ||
    'Something went wrong. Please try again.';
  return new ApiError(res.status, code, message, body);
}

const FALLBACK_MESSAGES: Record<number, string> = {
  401: 'Your session has ended. Please sign in again.',
  403: "You don't have permission to do that.",
  404: 'Not found.',
  409: 'This changed in the meantime. Refresh and try again.',
  429: 'Too many requests. Please wait a moment.',
  503: 'Service temporarily unavailable.',
};

/** Single-flight refresh: concurrent 401s share one refresh call. */
export function refreshSession(): Promise<boolean> {
  if (!inflightRefresh) {
    inflightRefresh = (async () => {
      const csrf = csrfToken();
      if (!csrf) {
        setSession(null);
        return false;
      }
      try {
        const res = await fetch(`${API}/auth/admin/refresh`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-CSRF-Token': csrf },
        });
        if (!res.ok) {
          setSession(null);
          return false;
        }
        setSession((await res.json()) as TokenResponse);
        return true;
      } catch {
        return false;
      } finally {
        inflightRefresh = null;
      }
    })();
  }
  return inflightRefresh;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  ifMatch?: number;
  auth?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const url = new URL(`${API}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.ifMatch !== undefined) headers['If-Match'] = String(opts.ifMatch);

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });

  if (res.status === 401 && opts.auth !== false && !retried) {
    if (await refreshSession()) return api<T>(path, opts, true);
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function signOut(): Promise<void> {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    setSession(null);
  }
}
