import type { ApiClient } from '@hungerly/api-client';
import { useQuery, type QueryResult } from '@hungerly/app-core';
import { useCallback, useRef, useState } from 'react';
import type { z } from 'zod';

import { api } from './api';
import { errorMessage } from './errors';

type Method = Parameters<ApiClient['request']>[0];

/**
 * Loads a GET endpoint and validates it against its contract schema. `key` should
 * include every input (branch id, filters) so a change refetches. Pass `null` as the
 * path to skip loading (e.g. no branch selected yet).
 */
export function useApiQuery<S extends z.ZodType>(
  path: string | null,
  schema: S,
  query?: Record<string, string | number | boolean | undefined | null>,
): QueryResult<z.infer<S>> {
  const key = path ? `${path}?${JSON.stringify(query ?? {})}` : 'idle';
  return useQuery(key, () =>
    path
      ? (api.request('GET', path, { schema, query }) as Promise<z.infer<S>>)
      : new Promise<z.infer<S>>(() => undefined),
  );
}

export interface MutationState<A extends unknown[], R> {
  run: (...args: A) => Promise<R | undefined>;
  pending: boolean;
  error: string | null;
  /** The raw error (for field-level messages). */
  rawError: unknown;
  reset: () => void;
}

/**
 * Wraps an async action with pending/error state and ignores double taps while it runs,
 * so a slow network never submits twice. Returns undefined when the action failed.
 */
export function useMutation<A extends unknown[], R>(action: (...args: A) => Promise<R>): MutationState<A, R> {
  const [pending, setPending] = useState(false);
  const [rawError, setRawError] = useState<unknown>(null);
  const running = useRef(false);
  const run = useCallback(
    async (...args: A) => {
      if (running.current) return undefined;
      running.current = true;
      setPending(true);
      setRawError(null);
      try {
        return await action(...args);
      } catch (error) {
        setRawError(error);
        return undefined;
      } finally {
        running.current = false;
        setPending(false);
      }
    },
    [action],
  );
  return {
    run,
    pending,
    rawError,
    error: rawError ? errorMessage(rawError) : null,
    reset: () => setRawError(null),
  };
}

/** Convenience for one request. */
export function request<S extends z.ZodType>(method: Method, path: string, schema: S, body?: unknown) {
  return api.request(method, path, { schema, body }) as Promise<z.infer<S>>;
}
