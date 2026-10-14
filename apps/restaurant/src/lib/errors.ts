import { isApiError } from '@hungerly/api-client';
import { isServiceError } from '@hungerly/app-core';

/** A sentence safe to show the owner for any thrown error. */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (isServiceError(error)) return error.message;
  return 'Something went wrong. Please try again.';
}

/** First validation message per field, for inline form errors. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error)) return {};
  return Object.fromEntries(
    Object.entries(error.fieldErrors)
      .filter(([, messages]) => messages.length > 0)
      .map(([field, messages]) => [field, messages[0]!]),
  );
}
