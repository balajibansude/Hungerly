import { z } from 'zod';

/**
 * Server configuration, read once from the environment and validated. Secrets live only
 * here (never in the apps). `scripts/generate-env.ts` writes a development `.env`.
 * Every business threshold (commission, payout minimum, coupon auto-approval) is
 * configuration, not code: the values below are development defaults that the business
 * must confirm before launch (docs/restaurant/OPERATIONS.md).
 */

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().default(4000),
    /** Public base URL of this API (used to build media URLs). */
    PUBLIC_BASE_URL: z.url().default('http://localhost:4000'),
    CORS_ORIGINS: z.string().default(''),
    TRUST_PROXY: bool.default(false),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().min(1),

    /** Ed25519 key pair (PKCS#8 / SPKI PEM, `\n` escaped) for access tokens. */
    JWT_PRIVATE_KEY: z.string().min(1),
    JWT_PUBLIC_KEY: z.string().min(1),
    JWT_ISSUER: z.string().default('hungerly-api'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(15 * 60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
    /** Secret mixed into refresh-token and OTP hashes (HMAC key). */
    TOKEN_HASH_SECRET: z.string().min(32),
    /** 32-byte base64 key for AES-256-GCM field encryption (bank account numbers). */
    FIELD_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded',
    }),

    /** Development only: accept this fixed OTP and log codes instead of sending them. */
    OTP_DEV_FIXED_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    /** SMS / email delivery (MSG91 per ADR-004). Unset = no delivery provider. */
    MSG91_AUTH_KEY: z.string().optional(),
    MSG91_OTP_TEMPLATE_ID: z.string().optional(),

    /** Private document storage (local disk driver). S3 driver: see docs. */
    STORAGE_DIR: z.string().default('./storage'),

    // --- Business policy (confirm with the business before launch) ---
    DEFAULT_COMMISSION_BPS: z.coerce.number().int().min(0).max(5000).default(1800),
    COMMISSION_TAX_BPS: z.coerce.number().int().min(0).max(5000).default(1800),
    SETTLEMENT_HOLD_DAYS: z.coerce.number().int().min(0).max(30).default(2),
    MIN_WITHDRAWAL_MINOR: z.coerce.number().int().min(100).default(50_000),
    COUPON_AUTO_MAX_PERCENT_BPS: z.coerce.number().int().default(3000),
    COUPON_AUTO_MAX_FLAT_MINOR: z.coerce.number().int().default(15_000),
    COUPON_AUTO_MAX_CAP_MINOR: z.coerce.number().int().default(20_000),
    COUPON_AUTO_MAX_DURATION_DAYS: z.coerce.number().int().default(31),
    ORDER_ACCEPT_WINDOW_SECONDS: z.coerce.number().int().default(180),
    REVIEW_REPLY_EDIT_HOURS: z.coerce.number().int().default(24),

    // --- RazorpayX payouts. All three unset = payouts disabled ("unconfigured"). ---
    RAZORPAYX_KEY_ID: z.string().optional(),
    RAZORPAYX_KEY_SECRET: z.string().optional(),
    /** Your RazorpayX account number (the debit account), not a restaurant's. */
    RAZORPAYX_ACCOUNT_NUMBER: z.string().optional(),
    RAZORPAYX_WEBHOOK_SECRET: z.string().optional(),
    RAZORPAYX_PAYOUT_MODE: z.enum(['IMPS', 'NEFT', 'RTGS']).default('IMPS'),
    RAZORPAYX_BASE_URL: z.url().default('https://api.razorpay.com'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.OTP_DEV_FIXED_CODE) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_DEV_FIXED_CODE'],
        message: 'A fixed OTP is never allowed in production',
      });
    }
    const rzp = [env.RAZORPAYX_KEY_ID, env.RAZORPAYX_KEY_SECRET, env.RAZORPAYX_ACCOUNT_NUMBER];
    if (rzp.some(Boolean) && !rzp.every(Boolean)) {
      ctx.addIssue({
        code: 'custom',
        path: ['RAZORPAYX_KEY_ID'],
        message: 'Set RAZORPAYX_KEY_ID, RAZORPAYX_KEY_SECRET and RAZORPAYX_ACCOUNT_NUMBER together',
      });
    }
  });

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

/** PEM values are stored on one line in .env with literal "\n". */
export function pem(value: string): string {
  return value.replace(/\\n/g, '\n');
}
