import { z } from 'zod';

/**
 * Wire primitives shared by every endpoint.
 *
 * Conventions (docs/restaurant/API.md):
 * - JSON, camelCase, under `/api/v1`.
 * - Money is integer paise inside a `Money` object, never floats.
 * - Instants are ISO-8601 UTC strings; local dates are "YYYY-MM-DD"; local times "HH:MM"
 *   in the branch's timezone (India only: Asia/Kolkata).
 * - Errors are RFC 9457 problem documents (`ProblemSchema`).
 */

export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

export const MoneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.literal('INR'),
});
export type Money = z.infer<typeof MoneySchema>;

/** Amount entered by a person: whole paise, never negative. */
export const AmountMinorSchema = z.number().int().nonnegative().max(1_000_000_000);

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const LocalDateSchema = z.iso.date();
export const LocalTimeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use HH:MM');
export const DayOfWeekSchema = z.number().int().min(0).max(6);

export const GeoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const PageQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** RFC 9457 problem details, with a stable machine-readable `code`. */
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  /** Field-level validation messages keyed by dotted path. */
  errors: z.record(z.string(), z.array(z.string())).optional(),
});
export type Problem = z.infer<typeof ProblemSchema>;

/** Stable error codes. Clients branch on these, never on `title`/`detail` text. */
export const ERROR_CODES = [
  'validation',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'version_conflict',
  'rate_limited',
  'idempotency_conflict',
  'auth.otp_invalid',
  'auth.otp_expired',
  'auth.otp_attempts_exceeded',
  'auth.delivery_unavailable',
  'auth.session_expired',
  'auth.role_not_allowed',
  'branch.invalid_transition',
  'branch.onboarding_incomplete',
  'branch.documents_incomplete',
  'branch.not_active',
  'branch.unavailable',
  'document.invalid_file',
  'document.not_reviewable',
  'declaration.outdated',
  'order.invalid_transition',
  'order.version_conflict',
  'payout.provider_unconfigured',
  'payout.account_unverified',
  'payout.below_minimum',
  'payout.insufficient_balance',
  'payout.not_eligible',
  'payout.provider_error',
  'coupon.invalid',
  'coupon.duplicate_code',
  'coupon.not_editable',
  'review.reply_not_editable',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const OkSchema = z.object({ ok: z.literal(true) });
