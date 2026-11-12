import { z } from 'zod';

import { BranchStatusSchema, BusinessSchema } from './auth';
import {
  AmountMinorSchema,
  DayOfWeekSchema,
  GeoPointSchema,
  IdSchema,
  IsoDateTimeSchema,
  LocalDateSchema,
  LocalTimeSchema,
  MoneySchema,
} from './common';

// --- Business (owner's legal entity, shared by all of the owner's branches) ---------

export const UpsertBusinessSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  legalName: z.string().trim().min(2).max(120),
  entityType: BusinessSchema.shape.entityType,
  /** Optional; validated as a 15-character GSTIN when present. */
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN')
    .nullable(),
});
export type UpsertBusiness = z.infer<typeof UpsertBusinessSchema>;

/** Partial edit of an existing business (PATCH); creating one goes through PUT. */
export const UpdateBusinessSchema = UpsertBusinessSchema.partial();
export type UpdateBusiness = z.infer<typeof UpdateBusinessSchema>;

// --- Branch -------------------------------------------------------------------------

export const LocationSourceSchema = z.enum(['map_pin', 'device', 'search', 'manual']);

export const BranchAddressSchema = z.object({
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).nullable(),
  locality: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  postalCode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit PIN code'),
});
export type BranchAddress = z.infer<typeof BranchAddressSchema>;

export const BranchLocationSchema = GeoPointSchema.extend({ source: LocationSourceSchema });
export type BranchLocation = z.infer<typeof BranchLocationSchema>;

export const RestaurantFoodTypeSchema = z.enum(['veg_only', 'mixed']);

export const CreateBranchSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

/** Every field optional: onboarding saves step by step (save and resume). */
export const UpdateBranchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  cuisines: z.array(z.string().trim().min(2).max(40)).min(1).max(8).optional(),
  foodType: RestaurantFoodTypeSchema.optional(),
  phoneE164: z.string().regex(/^\+91[6-9]\d{9}$/).optional(),
  email: z.email().max(254).nullable().optional(),
  address: BranchAddressSchema.optional(),
  location: BranchLocationSchema.optional(),
  avgPrepMinutes: z.number().int().min(5).max(120).optional(),
  minimumOrderMinor: AmountMinorSchema.optional(),
  packagingFeeMinor: AmountMinorSchema.max(10_000).optional(),
});
export type UpdateBranch = z.infer<typeof UpdateBranchSchema>;

export const OnboardingStepSchema = z.enum([
  'business',
  'details',
  'location',
  'contact',
  'hours',
  'licence',
  'bank',
  'declaration',
]);
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

export const OnboardingChecklistSchema = z.object({
  steps: z.array(
    z.object({
      step: OnboardingStepSchema,
      complete: z.boolean(),
      /** Why the step is incomplete, in plain words for the owner. */
      hint: z.string().nullable(),
    }),
  ),
  canSubmit: z.boolean(),
  /** What still blocks admin approval after submission (e.g. licence still in review). */
  approvalBlockers: z.array(z.string()),
});
export type OnboardingChecklist = z.infer<typeof OnboardingChecklistSchema>;

export const HoursSessionSchema = z.object({
  dayOfWeek: DayOfWeekSchema,
  opensAt: LocalTimeSchema,
  closesAt: LocalTimeSchema,
});
export type HoursSession = z.infer<typeof HoursSessionSchema>;

export const AvailabilityStateSchema = z.enum([
  'open',
  'on_break',
  'closed_for_day',
  'not_open_yet',
  'holiday',
  'paused',
  'offline',
  'not_active',
]);
export type AvailabilityState = z.infer<typeof AvailabilityStateSchema>;

export const AvailabilitySchema = z.object({
  state: AvailabilityStateSchema,
  acceptingOrders: z.boolean(),
  /** Plain-language reason shown to the owner (and, later, customers). */
  reason: z.string(),
  /** When the current open session ends (state `open`). */
  closesAt: IsoDateTimeSchema.nullable(),
  /** Next time the schedule opens, if any within the next 14 days. */
  nextOpenAt: IsoDateTimeSchema.nullable(),
  pausedUntil: IsoDateTimeSchema.nullable(),
  evaluatedAt: IsoDateTimeSchema,
  timezone: z.string(),
});
export type Availability = z.infer<typeof AvailabilitySchema>;

export const BranchSchema = z.object({
  id: IdSchema,
  businessId: IdSchema,
  name: z.string(),
  description: z.string(),
  cuisines: z.array(z.string()),
  foodType: RestaurantFoodTypeSchema,
  phoneE164: z.string().nullable(),
  email: z.string().nullable(),
  address: BranchAddressSchema.nullable(),
  location: BranchLocationSchema.nullable(),
  timezone: z.string(),
  status: BranchStatusSchema,
  /** Admin's reason for rejected/suspended/closed. */
  statusReason: z.string().nullable(),
  isAcceptingOrders: z.boolean(),
  avgPrepMinutes: z.number().int(),
  minimumOrder: MoneySchema,
  packagingFee: MoneySchema,
  /** Set by an administrator at approval; null until then. */
  commissionBps: z.number().int().nullable(),
  hours: z.array(HoursSessionSchema),
  availability: AvailabilitySchema,
  submittedAt: IsoDateTimeSchema.nullable(),
  approvedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Branch = z.infer<typeof BranchSchema>;

export const BranchDetailSchema = z.object({
  branch: BranchSchema,
  onboarding: OnboardingChecklistSchema,
});
export type BranchDetail = z.infer<typeof BranchDetailSchema>;

// --- Hours, holidays, manual pause --------------------------------------------------

export const ReplaceHoursSchema = z.object({
  sessions: z.array(HoursSessionSchema).max(7 * 6),
});

export const ClosureSchema = z.object({
  id: IdSchema,
  date: LocalDateSchema,
  note: z.string().nullable(),
});
export type Closure = z.infer<typeof ClosureSchema>;

export const CreateClosureSchema = z.object({
  date: LocalDateSchema,
  note: z.string().trim().max(120).nullable(),
});

export const HoursResponseSchema = z.object({
  sessions: z.array(HoursSessionSchema),
  closures: z.array(ClosureSchema),
  availability: AvailabilitySchema,
});
export type HoursResponse = z.infer<typeof HoursResponseSchema>;

/** Online/offline switch and temporary pause ("closed for the next 30 minutes"). */
export const UpdateIntakeSchema = z.object({
  isAcceptingOrders: z.boolean().optional(),
  /** Pause new orders for this many minutes; `null` ends a pause. */
  pauseMinutes: z.number().int().min(10).max(24 * 60).nullable().optional(),
  pauseReason: z.string().trim().max(120).optional(),
});

// --- Documents (food licence and other KYC) -----------------------------------------

export const DocumentTypeSchema = z.enum([
  'fssai_license',
  'bank_proof',
  'gst_certificate',
  'pan_card',
  'shop_establishment',
  'other',
]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const DocumentStatusSchema = z.enum([
  'pending_review',
  'approved',
  'rejected',
  'expired',
  'superseded',
]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

/** Per-type status the owner sees: includes the states with no document row. */
export const DocumentStateSchema = z.enum([
  'not_submitted',
  'pending_review',
  'approved',
  'resubmission_required',
  'expired',
]);
export type DocumentState = z.infer<typeof DocumentStateSchema>;

export const DocumentSchema = z.object({
  id: IdSchema,
  branchId: IdSchema,
  type: DocumentTypeSchema,
  documentNumber: z.string().nullable(),
  expiresOn: LocalDateSchema.nullable(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  status: DocumentStatusSchema,
  rejectionReason: z.string().nullable(),
  submittedAt: IsoDateTimeSchema,
  reviewedAt: IsoDateTimeSchema.nullable(),
});
export type BranchDocument = z.infer<typeof DocumentSchema>;

export const DocumentRequirementSchema = z.object({
  type: DocumentTypeSchema,
  required: z.boolean(),
  state: DocumentStateSchema,
  /** The latest non-superseded upload, if any. */
  current: DocumentSchema.nullable(),
  /** Plain-language next action ("Upload your FSSAI licence"). */
  nextAction: z.string().nullable(),
});
export type DocumentRequirement = z.infer<typeof DocumentRequirementSchema>;

export const DocumentsResponseSchema = z.object({
  requirements: z.array(DocumentRequirementSchema),
  history: z.array(DocumentSchema),
});
export type DocumentsResponse = z.infer<typeof DocumentsResponseSchema>;

/** Multipart form fields sent with the file (`file` part) to the upload endpoint. */
export const UploadDocumentFieldsSchema = z.object({
  type: DocumentTypeSchema,
  /** FSSAI licence/registration numbers are 14 digits. */
  documentNumber: z.string().trim().max(40).optional(),
  expiresOn: LocalDateSchema.optional(),
});

export const DOCUMENT_UPLOAD_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] as const,
};

// --- Declaration ----------------------------------------------------------------

export const DeclarationSchema = z.object({
  version: z.string(),
  title: z.string(),
  /** Clauses shown to the owner, in order. */
  clauses: z.array(z.object({ heading: z.string(), body: z.string() })),
  /** SHA-256 of the canonical text; sent back on acceptance to prove what was shown. */
  textSha256: z.string(),
  legalReviewStatus: z.literal('draft_pending_legal_review'),
});
export type Declaration = z.infer<typeof DeclarationSchema>;

export const AcceptDeclarationSchema = z.object({
  version: z.string(),
  textSha256: z.string().length(64),
});

export const DeclarationAcceptanceSchema = z.object({
  version: z.string(),
  acceptedAt: IsoDateTimeSchema,
  acceptedBy: IdSchema,
  isCurrentVersion: z.boolean(),
});
export type DeclarationAcceptance = z.infer<typeof DeclarationAcceptanceSchema>;

export const DeclarationStatusSchema = z.object({
  current: DeclarationSchema,
  acceptance: DeclarationAcceptanceSchema.nullable(),
});
export type DeclarationStatus = z.infer<typeof DeclarationStatusSchema>;
