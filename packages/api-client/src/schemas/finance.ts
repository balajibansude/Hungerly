import { z } from 'zod';

import {
  AmountMinorSchema,
  IdSchema,
  IsoDateTimeSchema,
  LocalDateSchema,
  MoneySchema,
  pageSchema,
} from './common';

// --- Payout destination (one current bank account per branch) -----------------------

export const PayoutAccountStatusSchema = z.enum([
  /** Saved; waiting for the provider validation or a finance review. */
  'pending_verification',
  /** Validation submitted to the provider; result not back yet. */
  'verification_in_progress',
  'verified',
  /** The provider reported the account invalid, or finance rejected it. */
  'failed',
  /** Replaced by a newer account or disabled by finance. */
  'disabled',
]);
export type PayoutAccountStatus = z.infer<typeof PayoutAccountStatusSchema>;

/** Never contains the full account number: last four digits only. */
export const PayoutAccountSchema = z.object({
  id: IdSchema,
  branchId: IdSchema,
  accountHolderName: z.string(),
  accountNumberLast4: z.string().length(4),
  ifsc: z.string(),
  status: PayoutAccountStatusSchema,
  /** Name the bank returned during validation, when available. */
  registeredName: z.string().nullable(),
  failureReason: z.string().nullable(),
  verifiedAt: IsoDateTimeSchema.nullable(),
  verifiedVia: z.enum(['provider', 'finance_review']).nullable(),
  createdAt: IsoDateTimeSchema,
});
export type PayoutAccount = z.infer<typeof PayoutAccountSchema>;

export const PayoutAccountResponseSchema = z.object({
  current: PayoutAccountSchema.nullable(),
  /** Explains what happens next (e.g. "Finance will verify this account"). */
  nextStep: z.string().nullable(),
});
export type PayoutAccountResponse = z.infer<typeof PayoutAccountResponseSchema>;

export const SetPayoutAccountSchema = z
  .object({
    accountHolderName: z.string().trim().min(3).max(100),
    accountNumber: z.string().regex(/^\d{9,18}$/, 'Account numbers are 9–18 digits'),
    confirmAccountNumber: z.string(),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid 11-character IFSC'),
  })
  .refine((v) => v.accountNumber === v.confirmAccountNumber, {
    path: ['confirmAccountNumber'],
    message: 'Account numbers do not match',
  });
export type SetPayoutAccount = z.infer<typeof SetPayoutAccountSchema>;

// --- Provider status ------------------------------------------------------------------

export const PayoutProviderStatusSchema = z.object({
  provider: z.literal('razorpayx'),
  /**
   * unconfigured: no credentials on the server, withdrawals are disabled.
   * test: sandbox keys, no real money moves. live: real transfers.
   */
  mode: z.enum(['unconfigured', 'test', 'live']),
});
export type PayoutProviderStatus = z.infer<typeof PayoutProviderStatusSchema>;

// --- Wallet ---------------------------------------------------------------------------

export const LedgerEntryTypeSchema = z.enum([
  'order_earning',
  'commission',
  'commission_tax',
  'restaurant_discount',
  'refund_deduction',
  'adjustment',
  'payout',
  'payout_reversal',
]);
export type LedgerEntryType = z.infer<typeof LedgerEntryTypeSchema>;

export const LedgerEntrySchema = z.object({
  id: IdSchema,
  type: LedgerEntryTypeSchema,
  /** Signed: credits positive, debits negative. */
  amount: MoneySchema,
  description: z.string(),
  orderId: IdSchema.nullable(),
  orderNumber: z.string().nullable(),
  payoutId: IdSchema.nullable(),
  /** When the amount becomes withdrawable (settlement hold). */
  availableAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const LedgerPageSchema = pageSchema(LedgerEntrySchema);

export const PayoutEligibilitySchema = z.object({
  canWithdraw: z.boolean(),
  /** Every reason withdrawal is blocked, in plain words. Empty when allowed. */
  blockers: z.array(
    z.object({
      code: z.enum([
        'provider_unconfigured',
        'branch_not_active',
        'no_payout_account',
        'payout_account_unverified',
        'below_minimum',
      ]),
      message: z.string(),
    }),
  ),
});

export const WalletSchema = z.object({
  branchId: IdSchema,
  /** Settled earnings minus payouts: what can be withdrawn now. */
  available: MoneySchema,
  /** Earnings still inside the settlement hold. */
  pending: MoneySchema,
  /** Payouts requested but not yet final (already deducted from `available`). */
  inFlightPayouts: MoneySchema,
  minimumWithdrawal: MoneySchema,
  settlementHoldDays: z.number().int(),
  payoutAccount: PayoutAccountSchema.nullable(),
  provider: PayoutProviderStatusSchema,
  eligibility: PayoutEligibilitySchema,
  includesDevFixtures: z.boolean(),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const WalletSummaryQuerySchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
});

/**
 * Period figures. Gross sales are what customers paid for food; earnings are what the
 * restaurant keeps after commission, tax on commission and its own discounts and refunds.
 */
export const WalletSummarySchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
  deliveredOrders: z.number().int(),
  grossSales: MoneySchema,
  commission: MoneySchema,
  commissionTax: MoneySchema,
  restaurantDiscounts: MoneySchema,
  refunds: MoneySchema,
  adjustments: MoneySchema,
  netEarnings: MoneySchema,
  paidOut: MoneySchema,
  daily: z.array(
    z.object({ date: LocalDateSchema, grossSales: MoneySchema, netEarnings: MoneySchema }),
  ),
  includesDevFixtures: z.boolean(),
});
export type WalletSummary = z.infer<typeof WalletSummarySchema>;

// --- Payouts --------------------------------------------------------------------------

export const PayoutStatusSchema = z.enum([
  /** Saved and money reserved; not yet accepted by the provider. */
  'requested',
  'queued',
  'pending_approval',
  'processing',
  'processed',
  'failed',
  'reversed',
  'cancelled',
  'rejected',
]);
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>;

export const PayoutSchema = z.object({
  id: IdSchema,
  branchId: IdSchema,
  amount: MoneySchema,
  status: PayoutStatusSchema,
  providerMode: z.enum(['test', 'live']),
  providerPayoutId: z.string().nullable(),
  /** Bank reference (UTR) once processed. */
  utr: z.string().nullable(),
  failureReason: z.string().nullable(),
  destinationLast4: z.string(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Payout = z.infer<typeof PayoutSchema>;

export const PayoutPageSchema = pageSchema(PayoutSchema);

/** Send with an `Idempotency-Key` header (UUID); retries return the same payout. */
export const RequestPayoutSchema = z.object({ amountMinor: AmountMinorSchema.min(100) });

// --- Coupons --------------------------------------------------------------------------

export const CouponDiscountSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('percent'),
    /** Basis points: 1500 = 15%. */
    percentBps: z.number().int().min(100).max(10_000),
    maxDiscountMinor: AmountMinorSchema.min(100).nullable(),
  }),
  z.object({ type: z.literal('flat'), amountMinor: AmountMinorSchema.min(100) }),
]);
export type CouponDiscount = z.infer<typeof CouponDiscountSchema>;

export const CouponInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,15}$/, 'Use 4–15 letters or digits'),
  title: z.string().trim().min(3).max(60),
  description: z.string().trim().max(200).default(''),
  discount: CouponDiscountSchema,
  minOrderMinor: AmountMinorSchema,
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  /** Empty = all of the owner's branches. */
  branchIds: z.array(IdSchema).max(50).default([]),
  /** Empty = every item at the eligible branches. */
  menuItemIds: z.array(IdSchema).max(200).default([]),
  usageLimitTotal: z.number().int().min(1).max(1_000_000).nullable(),
  usageLimitPerCustomer: z.number().int().min(1).max(100).nullable(),
});
export type CouponInput = z.infer<typeof CouponInputSchema>;

/**
 * Partial update. Defined without defaults on purpose: `CouponInputSchema.partial()` would
 * fill omitted `branchIds`/`menuItemIds`/`description` with their defaults and wipe them.
 */
export const CouponPatchSchema = z.object({
  code: CouponInputSchema.shape.code.optional(),
  title: CouponInputSchema.shape.title.optional(),
  description: z.string().trim().max(200).optional(),
  discount: CouponDiscountSchema.optional(),
  minOrderMinor: AmountMinorSchema.optional(),
  startsAt: IsoDateTimeSchema.optional(),
  endsAt: IsoDateTimeSchema.optional(),
  branchIds: z.array(IdSchema).max(50).optional(),
  menuItemIds: z.array(IdSchema).max(200).optional(),
  usageLimitTotal: z.number().int().min(1).max(1_000_000).nullable().optional(),
  usageLimitPerCustomer: z.number().int().min(1).max(100).nullable().optional(),
});
export type CouponPatch = z.infer<typeof CouponPatchSchema>;

export const CouponApprovalStatusSchema = z.enum([
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

/** What the owner sees: approval state combined with the date window. */
export const CouponDisplayStatusSchema = z.enum([
  'pending_approval',
  'scheduled',
  'active',
  'expired',
  'rejected',
  'cancelled',
]);
export type CouponDisplayStatus = z.infer<typeof CouponDisplayStatusSchema>;

export const CouponReviewReasonSchema = z.enum([
  'percent_above_auto_limit',
  'flat_above_auto_limit',
  'percent_without_cap',
  'cap_above_auto_limit',
  'duration_above_auto_limit',
  'flat_close_to_min_order',
]);
export type CouponReviewReason = z.infer<typeof CouponReviewReasonSchema>;

export const CouponSchema = z.object({
  id: IdSchema,
  code: z.string(),
  title: z.string(),
  description: z.string(),
  discount: CouponDiscountSchema,
  minOrder: MoneySchema,
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  branchIds: z.array(IdSchema),
  menuItemIds: z.array(IdSchema),
  usageLimitTotal: z.number().int().nullable(),
  usageLimitPerCustomer: z.number().int().nullable(),
  approvalStatus: CouponApprovalStatusSchema,
  displayStatus: CouponDisplayStatusSchema,
  approvalRoute: z.enum(['auto', 'manual']),
  /** Why the coupon needs an administrator (empty for auto-approved coupons). */
  reviewReasons: z.array(CouponReviewReasonSchema),
  rejectionReason: z.string().nullable(),
  redemptions: z.number().int(),
  createdAt: IsoDateTimeSchema,
});
export type Coupon = z.infer<typeof CouponSchema>;

export const CouponPreviewSchema = z.object({
  valid: z.boolean(),
  issues: z.array(z.object({ field: z.string(), message: z.string() })),
  approvalRoute: z.enum(['auto', 'manual']),
  reviewReasons: z.array(z.object({ code: CouponReviewReasonSchema, message: z.string() })),
  /** Example: the discount on an order exactly at the minimum value. */
  exampleDiscountAtMinimum: MoneySchema,
});
export type CouponPreview = z.infer<typeof CouponPreviewSchema>;

export const CouponPolicySchema = z.object({
  autoApproveMaxPercentBps: z.number().int(),
  autoApproveMaxFlatMinor: z.number().int(),
  autoApproveMaxCapMinor: z.number().int(),
  autoApproveMaxDurationDays: z.number().int(),
});
export type CouponPolicy = z.infer<typeof CouponPolicySchema>;

// --- Reviews --------------------------------------------------------------------------

export const ReviewReplySchema = z.object({
  body: z.string(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  /** Replies can be edited for a limited time after posting. */
  editableUntil: IsoDateTimeSchema,
});

export const ReviewSchema = z.object({
  id: IdSchema,
  branchId: IdSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  /** First name only; customers' contact details are never shown to restaurants. */
  customerName: z.string(),
  orderNumber: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  reply: ReviewReplySchema.nullable(),
  reported: z.boolean(),
  isDevFixture: z.boolean(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const ReviewPageSchema = pageSchema(ReviewSchema);

export const ReviewListQuerySchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  replied: z.enum(['yes', 'no']).optional(),
  sort: z.enum(['newest', 'oldest', 'lowest', 'highest']).default('newest'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const ReviewSummarySchema = z.object({
  average: z.number().nullable(),
  count: z.number().int(),
  distribution: z.object({
    1: z.number().int(),
    2: z.number().int(),
    3: z.number().int(),
    4: z.number().int(),
    5: z.number().int(),
  }),
  unanswered: z.number().int(),
});
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

export const ReplyToReviewSchema = z.object({ body: z.string().trim().min(2).max(1000) });
export const ReportReviewSchema = z.object({
  reason: z.enum(['abusive', 'spam', 'not_a_customer', 'wrong_restaurant', 'other']),
  note: z.string().trim().max(500).nullable(),
});
