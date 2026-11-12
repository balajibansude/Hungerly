import type { QueryResult } from '@hungerly/app-core';
import { ErrorState, LoadingState } from '@hungerly/ui';
import type { ReactNode } from 'react';

import { errorMessage } from '@/lib/errors';

/**
 * Standard loading / error-with-retry wrapper for a query. Renders `children(data)` on
 * success. Every data screen uses it so states look and behave the same.
 */
export function QueryView<T>({
  query,
  children,
  loadingLabel,
}: {
  query: QueryResult<T>;
  children: (data: T) => ReactNode;
  loadingLabel?: string;
}) {
  if (query.status === 'loading') return <LoadingState label={loadingLabel} />;
  if (query.status === 'error') return <ErrorState message={errorMessage(query.error)} onRetry={query.refetch} />;
  return <>{children(query.data)}</>;
}
