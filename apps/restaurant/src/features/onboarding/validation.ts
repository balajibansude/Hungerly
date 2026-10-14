import type { z } from 'zod';

/**
 * First message per field from a Zod `safeParse` failure, keyed by dotted path
 * ("address.postalCode"), the same shape the server uses for its field errors.
 */
export function zodFieldErrors(result: z.ZodSafeParseResult<unknown>): Record<string, string> {
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    errors[key] ??= issue.message;
  }
  return errors;
}
