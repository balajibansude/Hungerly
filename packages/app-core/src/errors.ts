/**
 * Expected, user-recoverable failures. `code` values follow the API blueprint's
 * stable error codes (docs/API_BLUEPRINT.md §2.5, §4) so real API errors map 1:1 later.
 * One vocabulary for every app; each app only throws the codes its services can produce.
 */
export type ServiceErrorCode =
  | 'not_found'
  | 'network'
  | 'auth.otp_invalid'
  | 'auth.otp_expired'
  | 'auth.otp_rate_limited'
  | 'validation'
  | 'order.invalid_transition'
  | 'order.version_conflict'
  | 'restaurant.not_active'
  | 'restaurant.outside_hours'
  | 'partner.insufficient_role'
  | 'unknown';

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/** A human message for any thrown value; never shows stack traces or raw codes. */
export function userMessage(error: unknown): string {
  if (isServiceError(error)) return error.message;
  return 'Something went wrong. Please try again.';
}
