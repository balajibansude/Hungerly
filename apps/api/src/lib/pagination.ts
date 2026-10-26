import { badRequest } from './errors';

/**
 * Opaque keyset cursors: base64url JSON of the last row's sort key. Callers must still
 * scope queries by owner/branch; the cursor only positions within that scope.
 */
export function encodeCursor(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor<T extends Record<string, string | number>>(cursor: string | undefined): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    throw badRequest('validation', 'Invalid cursor.');
  }
}
