import type { z } from 'zod';

import { ProblemSchema, type ErrorCode, type Problem } from './schemas/common';

/**
 * A failed API call. `code` is the server's stable error code (or a client-side one for
 * network/parse failures); `fieldErrors` carries per-field validation messages.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'network' | 'invalid_response';
  readonly fieldErrors: Record<string, string[]>;

  constructor(
    status: number,
    code: ApiError['code'],
    message: string,
    fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export interface TokenStore {
  getAccessToken(): string | null;
  /**
   * Exchanges the stored refresh token for new tokens. Returns false when the session
   * cannot be renewed (signed out elsewhere, expired): the app must sign in again.
   */
  refresh(): Promise<boolean>;
}

export interface ApiClientOptions {
  /** Base URL including `/api/v1`, e.g. `https://api.example.com/api/v1`. */
  baseUrl: string;
  tokens?: TokenStore;
  /** Called once when a request is rejected and the session cannot be refreshed. */
  onSessionExpired?: () => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface RequestOptions<S extends z.ZodType | undefined> {
  /** Response schema; the body is validated so wire drift fails loudly. */
  schema?: S;
  body?: unknown;
  /** Multipart upload; mutually exclusive with `body`. */
  form?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  /** Skip the bearer token (sign-in endpoints). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

type Result<S> = S extends z.ZodType ? z.infer<S> : void;

export interface ApiClient {
  /** GET a non-JSON body (e.g. a CSV statement) as text, with the same auth and errors. */
  text(path: string, options?: Omit<RequestOptions<undefined>, 'schema' | 'body' | 'form'>): Promise<string>;
  request<S extends z.ZodType | undefined = undefined>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options?: RequestOptions<S>,
  ): Promise<Result<S>>;
  /** Absolute URL for a path (for downloads and images that need the token separately). */
  url(path: string): string;
}

function buildQuery(query: RequestOptions<undefined>['query']): string {
  if (!query) return '';
  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return params.length ? `?${params.join('&')}` : '';
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const base = options.baseUrl.replace(/\/+$/, '');

  async function send(
    method: string,
    path: string,
    opts: RequestOptions<z.ZodType | undefined>,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    let body: BodyInit | undefined;
    if (opts.form) {
      body = opts.form;
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const token = opts.anonymous ? null : (options.tokens?.getAccessToken() ?? null);
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    opts.signal?.addEventListener('abort', () => controller.abort());
    try {
      return await fetchImpl(`${base}${path}${buildQuery(opts.query)}`, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, 'network', 'Could not reach the server. Check your connection.');
    } finally {
      clearTimeout(timer);
    }
  }

  async function toError(response: Response): Promise<ApiError> {
    let problem: Problem | null = null;
    try {
      problem = ProblemSchema.parse(await response.json());
    } catch {
      problem = null;
    }
    if (!problem) {
      return new ApiError(response.status, 'internal', 'Something went wrong. Please try again.');
    }
    return new ApiError(
      response.status,
      problem.code as ErrorCode,
      problem.detail ?? problem.title,
      problem.errors ?? {},
    );
  }

  async function authorized(method: string, path: string, opts: RequestOptions<z.ZodType | undefined>) {
    let response = await send(method, path, opts);
    if (response.status === 401 && !opts.anonymous && options.tokens) {
      const renewed = await options.tokens.refresh();
      if (renewed) {
        response = await send(method, path, opts);
      }
      if (!renewed || response.status === 401) {
        options.onSessionExpired?.();
        throw await toError(response);
      }
    }
    if (!response.ok) throw await toError(response);
    return response;
  }

  return {
    url: (path) => `${base}${path}`,

    async text(path, opts = {}) {
      const response = await authorized('GET', path, { ...opts, headers: { Accept: 'text/plain, text/csv, */*', ...opts.headers } });
      return response.text();
    },

    async request(method, path, opts = {}) {
      const response = await authorized(method, path, opts);
      if (!opts.schema || response.status === 204) return undefined as never;

      const json: unknown = await response.json();
      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) {
        throw new ApiError(
          response.status,
          'invalid_response',
          'The app received data it does not understand. Please update the app.',
        );
      }
      return parsed.data as never;
    },
  };
}
