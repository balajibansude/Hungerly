import { z } from 'zod';

import { IdSchema } from './common';

// --- Partner (restaurant owner) sign-in: phone or email + one-time code -------------

export const OtpRequestSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('phone'), phoneE164: z.string().regex(/^\+91[6-9]\d{9}$/) }),
  z.object({ channel: z.literal('email'), email: z.email().max(254) }),
]);
export type OtpRequest = z.infer<typeof OtpRequestSchema>;

export const OtpChallengeSchema = z.object({
  requestId: IdSchema,
  expiresInSeconds: z.number().int(),
  resendAfterSeconds: z.number().int(),
  /**
   * Set only by a development server that has no SMS/email provider: the code is printed
   * in the server log instead of being delivered. Never present in production.
   */
  devDelivery: z.literal('server_log').optional(),
});
export type OtpChallenge = z.infer<typeof OtpChallengeSchema>;

export const OtpVerifySchema = z.object({
  requestId: IdSchema,
  code: z.string().regex(/^\d{6}$/),
});

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  /** Opaque, single use: every refresh returns a new one (rotation with reuse detection). */
  refreshToken: z.string(),
  accessExpiresInSeconds: z.number().int(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const RefreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });

/**
 * Owner is the only restaurant account role. `role` stays on the wire so older
 * clients and future admin-assigned roles can be told apart; new accounts are always owners.
 */
export const PartnerRoleSchema = z.literal('owner');

export const PartnerUserSchema = z.object({
  id: IdSchema,
  fullName: z.string().nullable(),
  phoneE164: z.string().nullable(),
  email: z.string().nullable(),
});
export type PartnerUser = z.infer<typeof PartnerUserSchema>;

export const BranchStatusSchema = z.enum([
  'draft',
  'pending_review',
  'active',
  'suspended',
  'rejected',
  'closed',
]);
export type BranchStatus = z.infer<typeof BranchStatusSchema>;

/** A branch in the session list: enough for the branch selector. */
export const BranchSummarySchema = z.object({
  id: IdSchema,
  name: z.string(),
  locality: z.string().nullable(),
  city: z.string().nullable(),
  status: BranchStatusSchema,
  role: PartnerRoleSchema,
});
export type BranchSummary = z.infer<typeof BranchSummarySchema>;

export const BusinessSchema = z.object({
  id: IdSchema,
  displayName: z.string(),
  legalName: z.string(),
  entityType: z.enum(['individual', 'partnership', 'llp', 'company', 'other']),
  gstin: z.string().nullable(),
});
export type Business = z.infer<typeof BusinessSchema>;

export const PartnerSessionSchema = z.object({
  user: PartnerUserSchema,
  /** Null until the owner completes the first onboarding step. */
  business: BusinessSchema.nullable(),
  branches: z.array(BranchSummarySchema),
});
export type PartnerSession = z.infer<typeof PartnerSessionSchema>;

export const SignInResponseSchema = z.object({
  tokens: TokenPairSchema,
  session: PartnerSessionSchema,
});
export type SignInResponse = z.infer<typeof SignInResponseSchema>;

export const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
});

// --- Admin sign-in -----------------------------------------------------------

export const AdminRoleSchema = z.enum(['super_admin', 'operations', 'finance', 'support']);
export type AdminRole = z.infer<typeof AdminRoleSchema>;

export const AdminLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(12).max(200),
});

export const AdminSignInResponseSchema = z.object({
  tokens: TokenPairSchema,
  admin: z.object({ id: IdSchema, email: z.string(), role: AdminRoleSchema }),
});
