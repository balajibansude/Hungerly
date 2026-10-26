import type { ErrorCode } from '@hungerly/api-client';

/**
 * Expected failures. Thrown from services; the error handler turns them into RFC 9457
 * problem documents with a stable `code`. Anything else becomes a 500 with no details.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: ErrorCode, message: string, fieldErrors?: Record<string, string[]>) =>
  new AppError(400, code, message, fieldErrors);
export const validationError = (message: string, fieldErrors?: Record<string, string[]>) =>
  new AppError(422, 'validation', message, fieldErrors);
export const unauthenticated = (message = 'Please sign in again.') =>
  new AppError(401, 'unauthenticated', message);
export const forbidden = (message = 'You do not have access to this.') =>
  new AppError(403, 'forbidden', message);
/** Also used for resources owned by someone else, so their existence is not revealed. */
export const notFound = (message = 'Not found.') => new AppError(404, 'not_found', message);
export const conflict = (code: ErrorCode, message: string) => new AppError(409, code, message);
export const unprocessable = (code: ErrorCode, message: string, fieldErrors?: Record<string, string[]>) =>
  new AppError(422, code, message, fieldErrors);
export const unavailable = (code: ErrorCode, message: string) => new AppError(503, code, message);
