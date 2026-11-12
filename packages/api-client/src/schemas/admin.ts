import { z } from 'zod';

import { BranchStatusSchema } from './auth';
import { DocumentSchema } from './branches';
import { IdSchema, IsoDateTimeSchema, pageSchema } from './common';
import { CouponSchema, PayoutAccountSchema } from './finance';

/**
 * Administrative review endpoints (`/api/v1/admin/...`). Only authenticated admins with
 * the listed role may call them; owners never can, whatever their client sends.
 * The admin web panel (ADR-006) is the intended UI; see docs/restaurant/ADMIN_INTEGRATION.md.
 */

export const AdminDocumentSchema = DocumentSchema.extend({
  branchName: z.string(),
  businessLegalName: z.string(),
});
export const AdminDocumentPageSchema = pageSchema(AdminDocumentSchema);

export const RejectWithReasonSchema = z.object({ reason: z.string().trim().min(5).max(500) });

export const AdminBranchSchema = z.object({
  id: IdSchema,
  name: z.string(),
  businessLegalName: z.string(),
  ownerName: z.string().nullable(),
  city: z.string().nullable(),
  status: BranchStatusSchema,
  submittedAt: IsoDateTimeSchema.nullable(),
  /** What still prevents approval (unapproved licence, unverified bank account, ...). */
  approvalBlockers: z.array(z.string()),
});
export const AdminBranchPageSchema = pageSchema(AdminBranchSchema);

export const ApproveBranchSchema = z.object({
  commissionBps: z.number().int().min(0).max(5000),
  note: z.string().trim().max(500).nullable(),
});

export const AdminCouponSchema = CouponSchema.extend({ businessLegalName: z.string() });
export const AdminCouponPageSchema = pageSchema(AdminCouponSchema);

export const AdminPayoutAccountSchema = PayoutAccountSchema.extend({ branchName: z.string() });
export const AdminPayoutAccountPageSchema = pageSchema(AdminPayoutAccountSchema);

/** Finance confirms a bank account out of band (e.g. cancelled cheque matched). */
export const VerifyPayoutAccountSchema = z.object({ note: z.string().trim().min(5).max(500) });

export const LedgerAdjustmentSchema = z.object({
  /** Signed paise: positive credits the restaurant, negative debits it. */
  amountMinor: z.number().int().min(-100_000_000).max(100_000_000).refine((v) => v !== 0),
  kind: z.enum(['adjustment', 'refund_deduction']),
  reason: z.string().trim().min(5).max(500),
  orderId: IdSchema.nullable(),
});
