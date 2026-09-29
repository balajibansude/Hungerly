import { useCallback, useEffect, useRef, useState } from 'react';

export type QueryState<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'error'; data: undefined; error: unknown }
  | { status: 'success'; data: T; error: undefined };

export type QueryResult<T> = QueryState<T> & {
  /** Re-runs the query. Existing data stays visible while refreshing. */
  refetch: () => void;
  isRefreshing: boolean;
};

type Settled<T> = Exclude<QueryState<T>, { status: 'loading' }>;

const LOADING = { status: 'loading', data: undefined, error: undefined } as const;

/**
 * Minimal async data hook: loading → success | error, with retry and pull-to-refresh.
 *
 * `key` identifies the query's inputs (e.g. `restaurant:${id}`); when it changes the
 * query re-runs, and results are tagged with their key so data for old inputs is never
 * shown for new ones. The same key-based shape as TanStack Query, which can replace this
 * implementation if caching/deduplication becomes necessary with the real API.
 */
export function useQuery<T>(key: string, load: () => Promise<T>): QueryResult<T> {
  const [result, setResult] = useState<{ key: string; state: Settled<T> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [isRefreshing, setRefreshing] = useState(false);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setResult({ key, state: { status: 'success', data, error: undefined } });
      })
      .catch((error: unknown) => {
        if (!cancelled) setResult({ key, state: { status: 'error', data: undefined, error } });
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const refetch = useCallback(() => {
    setRefreshing(true);
    setAttempt((n) => n + 1);
  }, []);

  const current = result?.key === key ? result.state : null;
  // Retrying after an error shows a loading state; refreshing successful data keeps it visible.
  const state: QueryState<T> =
    !current || (current.status === 'error' && isRefreshing) ? LOADING : current;

  return { ...state, refetch, isRefreshing: isRefreshing && state.status === 'success' };
}
