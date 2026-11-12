import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * PostgreSQL schema for the restaurant partner platform (docs/restaurant/DATA_MODEL.md).
 *
 * Conventions: UUID keys, money as bigint paise (`*_minor`), `timestamptz` everywhere,
 * enums as CHECK-constrained text (easier to evolve than PG enums), soft state over
 * deletes for anything with history. Migrations are generated with drizzle-kit into
 * ./migrations and applied by scripts/migrate.ts.
 */

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const minor = (name: string) => bigint(name, { mode: 'number' });
const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(', ')})`);

// --- Identity -----------------------------------------------------------------------

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;

export const users = pgTable(
  'users',
  {
    id: id(),
    phoneE164: text('phone_e164'),
    email: text('email'),
    fullName: text('full_name'),
    status: text('status', { enum: USER_STATUSES }).notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_phone_uq').on(t.phoneE164),
    uniqueIndex('users_email_uq').on(t.email),
    check('users_status_ck', inList('status', USER_STATUSES)),
    check('users_identity_ck', sql`phone_e164 is not null or email is not null`),
  ],
);

/**
 * Restaurant-side role of a user. Owner is the only role that can be granted.
 * 'manager' is kept in the CHECK only so historical rows (if any are ever imported from
 * the prototype or another system) are preserved and visibly *not* owners; no code path
 * creates it and every partner route requires 'owner' (docs/restaurant/MANAGER_ROLE.md).
 */
export const PARTNER_ROLES = ['owner', 'manager_legacy'] as const;

export const partnerAccounts = pgTable(
  'partner_accounts',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id),
    role: text('role', { enum: PARTNER_ROLES }).notNull().default('owner'),
    createdAt: createdAt(),
  },
  (t) => [check('partner_accounts_role_ck', inList('role', PARTNER_ROLES))],
);

export const ADMIN_ROLES = ['super_admin', 'operations', 'finance', 'support'] as const;

export const adminAccounts = pgTable(
  'admin_accounts',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id),
    role: text('role', { enum: ADMIN_ROLES }).notNull(),
    passwordHash: text('password_hash').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check('admin_accounts_role_ck', inList('role', ADMIN_ROLES))],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: id(),
    channel: text('channel', { enum: ['phone', 'email'] }).notNull(),
    identifier: text('identifier').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: smallint('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('otp_identifier_idx').on(t.identifier, t.createdAt)],
);

export const AUDIENCES = ['partner', 'admin', 'customer'] as const;

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    audience: text('audience', { enum: AUDIENCES }).notNull(),
    refreshHash: text('refresh_hash').notNull(),
    /** Previous refresh hash: presenting it again means the token was stolen (reuse). */
    previousRefreshHash: text('previous_refresh_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    userAgent: text('user_agent'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('auth_sessions_refresh_uq').on(t.refreshHash),
    index('auth_sessions_prev_idx').on(t.previousRefreshHash),
    index('auth_sessions_user_idx').on(t.userId),
  ],
);

// --- Business and branches -------------------------------------------------------------

export const ENTITY_TYPES = ['individual', 'partnership', 'llp', 'company', 'other'] as const;

/** The owner's legal entity. Shared legal details live here, once, for all branches. */
export const businesses = pgTable(
  'businesses',
  {
    id: id(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    displayName: text('display_name').notNull(),
    legalName: text('legal_name').notNull(),
    entityType: text('entity_type', { enum: ENTITY_TYPES }).notNull(),
    gstin: text('gstin'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('businesses_owner_uq').on(t.ownerUserId),
    check('businesses_entity_ck', inList('entity_type', ENTITY_TYPES)),
  ],
);

export const BRANCH_STATUSES = [
  'draft',
  'pending_review',
  'active',
  'suspended',
  'rejected',
  'closed',
] as const;
export const LOCATION_SOURCES = ['map_pin', 'device', 'search', 'manual'] as const;

/** One physical kitchen. Two branches may share a name in different places. */
export const branches = pgTable(
  'branches',
  {
    id: id(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    cuisines: text('cuisines').array().notNull().default(sql`'{}'::text[]`),
    foodType: text('food_type', { enum: ['veg_only', 'mixed'] }).notNull().default('mixed'),
    phoneE164: text('phone_e164'),
    email: text('email'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    locality: text('locality'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    locationSource: text('location_source', { enum: LOCATION_SOURCES }),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    status: text('status', { enum: BRANCH_STATUSES }).notNull().default('draft'),
    statusReason: text('status_reason'),
    isAcceptingOrders: boolean('is_accepting_orders').notNull().default(false),
    pausedUntil: timestamp('paused_until', { withTimezone: true }),
    pauseReason: text('pause_reason'),
    avgPrepMinutes: integer('avg_prep_minutes').notNull().default(20),
    minOrderMinor: minor('min_order_minor').notNull().default(0),
    packagingFeeMinor: minor('packaging_fee_minor').notNull().default(0),
    /** Set by an administrator at approval; null until approved. */
    commissionBps: integer('commission_bps'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('branches_business_idx').on(t.businessId),
    index('branches_status_idx').on(t.status),
    check('branches_status_ck', inList('status', BRANCH_STATUSES)),
    check('branches_food_type_ck', inList('food_type', ['veg_only', 'mixed'])),
    check(
      'branches_location_ck',
      sql`(latitude is null) = (longitude is null) and (latitude is null or (latitude between 6 and 38 and longitude between 68 and 98))`,
    ),
    check('branches_prep_ck', sql`avg_prep_minutes between 5 and 120`),
    check('branches_money_ck', sql`min_order_minor >= 0 and packaging_fee_minor >= 0`),
    check('branches_commission_ck', sql`commission_bps is null or commission_bps between 0 and 5000`),
  ],
);

export const branchHours = pgTable(
  'branch_hours',
  {
    id: id(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    dayOfWeek: smallint('day_of_week').notNull(),
    opensAt: text('opens_at').notNull(),
    closesAt: text('closes_at').notNull(),
  },
  (t) => [
    index('branch_hours_branch_idx').on(t.branchId),
    check('branch_hours_day_ck', sql`day_of_week between 0 and 6`),
    check('branch_hours_time_ck', sql`opens_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and closes_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);

/** Full-day closures (holidays). */
export const branchClosures = pgTable(
  'branch_closures',
  {
    id: id(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('branch_closures_uq').on(t.branchId, t.date)],
);

// --- Documents and declaration -----------------------------------------------------------

export const DOCUMENT_TYPES = [
  'fssai_license',
  'bank_proof',
  'gst_certificate',
  'pan_card',
  'shop_establishment',
  'other',
] as const;
export const DOCUMENT_STATUSES = [
  'pending_review',
  'approved',
  'rejected',
  'expired',
  'superseded',
] as const;

/** Uploaded files are private: stored outside any public path, served only after an authz check. */
export const documents = pgTable(
  'documents',
  {
    id: id(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    type: text('type', { enum: DOCUMENT_TYPES }).notNull(),
    documentNumber: text('document_number'),
    expiresOn: date('expires_on', { mode: 'string' }),
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    status: text('status', { enum: DOCUMENT_STATUSES }).notNull().default('pending_review'),
    rejectionReason: text('rejection_reason'),
    submittedBy: uuid('submitted_by')
      .notNull()
      .references(() => users.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => [
    index('documents_branch_type_idx').on(t.branchId, t.type),
    index('documents_status_idx').on(t.status),
    check('documents_type_ck', inList('type', DOCUMENT_TYPES)),
    check('documents_status_ck', inList('status', DOCUMENT_STATUSES)),
    check(
      'documents_review_ck',
      sql`(status in ('approved','rejected')) = (reviewed_at is not null) or status in ('expired','superseded')`,
    ),
    check('documents_reject_reason_ck', sql`status <> 'rejected' or rejection_reason is not null`),
  ],
);

export const declarationAcceptances = pgTable(
  'declaration_acceptances',
  {
    id: id(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    version: text('version').notNull(),
    textSha256: text('text_sha256').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('declaration_branch_version_uq').on(t.branchId, t.version)],
);

// --- Payout accounts -----------------------------------------------------------------------

export const PAYOUT_ACCOUNT_STATUSES = [
  'pending_verification',
  'verification_in_progress',
  'verified',
  'failed',
  'disabled',
] as const;

/**
 * Bank destination for a branch. The full account number is never returned by the API;
 * it is held AES-256-GCM encrypted only until the provider fund account exists, then
 * erased (`account_number_ciphertext = null`). Only `is_current` rows can receive payouts.
 */
export const payoutAccounts = pgTable(
  'payout_accounts',
  {
    id: id(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    accountHolderName: text('account_holder_name').notNull(),
    accountLast4: text('account_last4').notNull(),
    ifsc: text('ifsc').notNull(),
    accountNumberCiphertext: text('account_number_ciphertext'),
    /** SHA-256(HMAC) of the account number, to detect the same account being re-added. */
    accountFingerprint: text('account_fingerprint').notNull(),
    provider: text('provider', { enum: ['razorpayx'] }).notNull().default('razorpayx'),
    providerContactId: text('provider_contact_id'),
    providerFundAccountId: text('provider_fund_account_id'),
    providerValidationId: text('provider_validation_id'),
    status: text('status', { enum: PAYOUT_ACCOUNT_STATUSES }).notNull().default('pending_verification'),
    registeredName: text('registered_name'),
    failureReason: text('failure_reason'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedVia: text('verified_via', { enum: ['provider', 'finance_review'] }),
    verifiedBy: uuid('verified_by').references(() => users.id),
    isCurrent: boolean('is_current').notNull().default(true),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('payout_accounts_current_uq').on(t.branchId).where(sql`is_current`),
    uniqueIndex('payout_accounts_validation_uq').on(t.providerValidationId),
    check('payout_accounts_status_ck', inList('status', PAYOUT_ACCOUNT_STATUSES)),
    check(
      'payout_accounts_verified_ck',
      sql`(status = 'verified') = (verified_at is not null)`,
    ),
  ],
);

// --- Menu ------------------------------------------------------------------------------

export const FOOD_TYPES = ['veg', 'non_veg', 'egg', 'jain'] as const;

export const menuCategories = pgTable(
  'menu_categories',
  {
    id: id(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('menu_categories_branch_idx').on(t.branchId)],
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: id(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => menuCategories.id),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    priceMinor: minor('price_minor').notNull(),
    foodType: text('food_type', { enum: FOOD_TYPES }).notNull(),
    imageKey: text('image_key'),
    isAvailable: boolean('is_available').notNull().default(true),
    isArchived: boolean('is_archived').notNull().default(false),
    isBestseller: boolean('is_bestseller').notNull().default(false),
    prepMinutes: integer('prep_minutes'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('menu_items_branch_idx').on(t.branchId),
    index('menu_items_category_idx').on(t.categoryId),
    check('menu_items_price_ck', sql`price_minor between 100 and 5000000`),
    check('menu_items_food_type_ck', inList('food_type', FOOD_TYPES)),
  ],
);

// --- Platform pricing config ------------------------------------------------------------

export const NIGHT_CHARGE_TYPES = ['fixed', 'percent'] as const;

/**
 * Singleton-style configuration for platform-level pricing rules.
 * Only one row exists; GET returns it, PATCH updates it in place.
 * Created by migration 0002 with sensible defaults (feature disabled).
 */
export const platformPricingConfigs = pgTable(
  'platform_pricing_configs',
  {
    id: id(),
    nightChargeEnabled: boolean('night_charge_enabled').notNull().default(false),
    /** Night window start in IST, "HH:MM" (24-hour). */
    nightStart: text('night_start').notNull().default('22:00'),
    /** Night window end in IST, "HH:MM" (24-hour). May be earlier than nightStart (crosses midnight). */
    nightEnd: text('night_end').notNull().default('06:00'),
    chargeType: text('charge_type', { enum: NIGHT_CHARGE_TYPES }).notNull().default('fixed'),
    /** Surcharge in paise for chargeType='fixed'. Null when chargeType='percent'. */
    chargeAmountMinor: minor('charge_amount_minor'),
    /** Surcharge in basis points for chargeType='percent'. Null when chargeType='fixed'. */
    chargePercentBps: integer('charge_percent_bps'),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('platform_pricing_charge_type_ck', inList('charge_type', NIGHT_CHARGE_TYPES)),
    check(
      'platform_pricing_amount_ck',
      sql`(charge_type = 'fixed' and (charge_amount_minor is null or charge_amount_minor >= 0) and charge_percent_bps is null) or (charge_type = 'percent' and charge_percent_bps between 1 and 10000 and charge_amount_minor is null)`,
    ),
    check(
      'platform_pricing_time_ck',
      sql`night_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and night_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
  ],
);

// --- Orders ------------------------------------------------------------------------------

export const ORDER_STATUSES = [
  'pending_payment',
  'placed',
  'preparing',
  'ready_for_pickup',
  'picked_up',
  'delivered',
  'cancelled',
] as const;
export const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refund_pending',
  'partially_refunded',
  'refunded',
  'not_applicable',
] as const;
export const ORDER_ACTORS = ['customer', 'restaurant', 'delivery_partner', 'system', 'admin'] as const;

export const orders = pgTable(
  'orders',
  {
    id: id(),
    orderNumber: text('order_number').notNull(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    customerUserId: uuid('customer_user_id').references(() => users.id),
    customerFirstName: text('customer_first_name').notNull(),
    customerPhoneMasked: text('customer_phone_masked'),
    deliveryLocality: text('delivery_locality'),
    deliveryDistanceMeters: integer('delivery_distance_meters'),
    riderFirstName: text('rider_first_name'),
    instructions: text('instructions'),
    status: text('status', { enum: ORDER_STATUSES }).notNull(),
    paymentMethod: text('payment_method', { enum: ['online', 'cod'] }).notNull(),
    paymentStatus: text('payment_status', { enum: PAYMENT_STATUSES }).notNull(),
    subtotalMinor: minor('subtotal_minor').notNull(),
    packagingFeeMinor: minor('packaging_fee_minor').notNull().default(0),
    deliveryFeeMinor: minor('delivery_fee_minor').notNull().default(0),
    platformFeeMinor: minor('platform_fee_minor').notNull().default(0),
    taxMinor: minor('tax_minor').notNull().default(0),
    tipMinor: minor('tip_minor').notNull().default(0),
    /** Night-time surcharge. 0 for daytime orders and for orders before this feature was enabled. */
    nightChargeMinor: minor('night_charge_minor').notNull().default(0),
    discountMinor: minor('discount_minor').notNull().default(0),
    restaurantDiscountMinor: minor('restaurant_discount_minor').notNull().default(0),
    totalMinor: minor('total_minor').notNull(),
    couponId: uuid('coupon_id'),
    prepMinutes: integer('prep_minutes'),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    acceptBy: timestamp('accept_by', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: text('cancelled_by', { enum: ['customer', 'restaurant', 'system', 'admin'] }),
    cancelReason: text('cancel_reason'),
    version: integer('version').notNull().default(1),
    /** Rows created by scripts/seed-dev.ts. Refused by the seed script in production. */
    isDevFixture: boolean('is_dev_fixture').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('orders_number_uq').on(t.orderNumber),
    index('orders_branch_placed_idx').on(t.branchId, t.placedAt),
    index('orders_branch_status_idx').on(t.branchId, t.status),
    check('orders_status_ck', inList('status', ORDER_STATUSES)),
    check('orders_payment_status_ck', inList('payment_status', PAYMENT_STATUSES)),
    check(
      'orders_total_ck',
      sql`total_minor = subtotal_minor + packaging_fee_minor + delivery_fee_minor + platform_fee_minor + tax_minor + tip_minor + night_charge_minor - discount_minor`,
    ),
    check('orders_restaurant_discount_ck', sql`restaurant_discount_minor between 0 and discount_minor`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    menuItemId: uuid('menu_item_id').references(() => menuItems.id),
    name: text('name').notNull(),
    foodType: text('food_type', { enum: FOOD_TYPES }).notNull(),
    unitPriceMinor: minor('unit_price_minor').notNull(),
    quantity: integer('quantity').notNull(),
    options: jsonb('options')
      .$type<{ group: string; name: string; priceDeltaMinor: number }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    notes: text('notes'),
  },
  (t) => [index('order_items_order_idx').on(t.orderId), check('order_items_qty_ck', sql`quantity > 0`)],
);

export const orderStatusEvents = pgTable(
  'order_status_events',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    fromStatus: text('from_status', { enum: ORDER_STATUSES }),
    toStatus: text('to_status', { enum: ORDER_STATUSES }).notNull(),
    actorType: text('actor_type', { enum: ORDER_ACTORS }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('order_events_order_idx').on(t.orderId, t.createdAt)],
);

// --- Wallet ledger and payouts ------------------------------------------------------------

export const LEDGER_ENTRY_TYPES = [
  'order_earning',
  'commission',
  'commission_tax',
  'restaurant_discount',
  'refund_deduction',
  'adjustment',
  'payout',
  'payout_reversal',
] as const;

/**
 * Append-only ledger: the wallet balance is always a SUM over this table, computed on the
 * server. Rows are never updated or deleted (enforced by trigger in the migration).
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    type: text('type', { enum: LEDGER_ENTRY_TYPES }).notNull(),
    amountMinor: minor('amount_minor').notNull(),
    description: text('description').notNull(),
    orderId: uuid('order_id').references(() => orders.id),
    payoutId: uuid('payout_id'),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    isDevFixture: boolean('is_dev_fixture').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('ledger_branch_created_idx').on(t.branchId, t.createdAt),
    uniqueIndex('ledger_order_type_uq')
      .on(t.orderId, t.type)
      .where(sql`order_id is not null and type in ('order_earning','commission','commission_tax','restaurant_discount')`),
    uniqueIndex('ledger_payout_type_uq').on(t.payoutId, t.type).where(sql`payout_id is not null`),
    check('ledger_type_ck', inList('type', LEDGER_ENTRY_TYPES)),
    check('ledger_nonzero_ck', sql`amount_minor <> 0`),
  ],
);

export const PAYOUT_STATUSES = [
  'requested',
  'queued',
  'pending_approval',
  'processing',
  'processed',
  'failed',
  'reversed',
  'cancelled',
  'rejected',
] as const;

export const payouts = pgTable(
  'payouts',
  {
    id: id(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    payoutAccountId: uuid('payout_account_id')
      .notNull()
      .references(() => payoutAccounts.id),
    amountMinor: minor('amount_minor').notNull(),
    status: text('status', { enum: PAYOUT_STATUSES }).notNull().default('requested'),
    provider: text('provider', { enum: ['razorpayx'] }).notNull().default('razorpayx'),
    providerMode: text('provider_mode', { enum: ['test', 'live'] }).notNull(),
    providerPayoutId: text('provider_payout_id'),
    utr: text('utr'),
    failureReason: text('failure_reason'),
    idempotencyKey: text('idempotency_key').notNull(),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id),
    providerAttempts: integer('provider_attempts').notNull().default(0),
    lastProviderSyncAt: timestamp('last_provider_sync_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('payouts_idempotency_uq').on(t.branchId, t.idempotencyKey),
    uniqueIndex('payouts_provider_id_uq').on(t.providerPayoutId),
    index('payouts_branch_idx').on(t.branchId, t.createdAt),
    index('payouts_status_idx').on(t.status),
    check('payouts_status_ck', inList('status', PAYOUT_STATUSES)),
    check('payouts_amount_ck', sql`amount_minor >= 100`),
  ],
);

export const providerWebhookEvents = pgTable(
  'provider_webhook_events',
  {
    id: id(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => [uniqueIndex('webhook_events_uq').on(t.provider, t.eventId)],
);

// --- Coupons -----------------------------------------------------------------------------

export const COUPON_APPROVAL_STATUSES = [
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
] as const;

export const coupons = pgTable(
  'coupons',
  {
    id: id(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id),
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    discountType: text('discount_type', { enum: ['percent', 'flat'] }).notNull(),
    percentBps: integer('percent_bps'),
    flatMinor: minor('flat_minor'),
    maxDiscountMinor: minor('max_discount_minor'),
    minOrderMinor: minor('min_order_minor').notNull().default(0),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    usageLimitTotal: integer('usage_limit_total'),
    usageLimitPerCustomer: integer('usage_limit_per_customer'),
    approvalStatus: text('approval_status', { enum: COUPON_APPROVAL_STATUSES }).notNull(),
    approvalRoute: text('approval_route', { enum: ['auto', 'manual'] }).notNull(),
    reviewReasons: text('review_reasons').array().notNull().default(sql`'{}'::text[]`),
    rejectionReason: text('rejection_reason'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    redemptions: integer('redemptions').notNull().default(0),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('coupons_code_live_uq')
      .on(t.businessId, t.code)
      .where(sql`approval_status in ('pending_approval','approved')`),
    check('coupons_status_ck', inList('approval_status', COUPON_APPROVAL_STATUSES)),
    check(
      'coupons_discount_ck',
      sql`(discount_type = 'percent' and percent_bps between 100 and 10000 and flat_minor is null) or (discount_type = 'flat' and flat_minor >= 100 and percent_bps is null)`,
    ),
    check('coupons_window_ck', sql`ends_at > starts_at`),
    check(
      'coupons_manual_review_ck',
      sql`approval_route = 'manual' or approval_status <> 'pending_approval'`,
    ),
  ],
);

export const couponBranches = pgTable(
  'coupon_branches',
  {
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
  },
  (t) => [uniqueIndex('coupon_branches_uq').on(t.couponId, t.branchId)],
);

export const couponItems = pgTable(
  'coupon_items',
  {
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
  },
  (t) => [uniqueIndex('coupon_items_uq').on(t.couponId, t.menuItemId)],
);

// --- Reviews ------------------------------------------------------------------------------

export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    orderId: uuid('order_id').references(() => orders.id),
    rating: smallint('rating').notNull(),
    comment: text('comment'),
    customerDisplayName: text('customer_display_name').notNull(),
    moderationStatus: text('moderation_status', { enum: ['visible', 'hidden', 'flagged'] })
      .notNull()
      .default('visible'),
    isDevFixture: boolean('is_dev_fixture').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('reviews_branch_idx').on(t.branchId, t.createdAt),
    uniqueIndex('reviews_order_uq').on(t.orderId),
    check('reviews_rating_ck', sql`rating between 1 and 5`),
  ],
);

export const reviewReplies = pgTable(
  'review_replies',
  {
    id: id(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    body: text('body').notNull(),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('review_replies_review_uq').on(t.reviewId)],
);

export const reviewReports = pgTable(
  'review_reports',
  {
    id: id(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    reportedBy: uuid('reported_by')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    note: text('note'),
    status: text('status', { enum: ['open', 'upheld', 'dismissed'] }).notNull().default('open'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('review_reports_open_uq').on(t.reviewId).where(sql`status = 'open'`)],
);

// --- Audit ---------------------------------------------------------------------------------

/** Append-only (trigger). Metadata must never contain secrets or full bank numbers. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    actorType: text('actor_type', { enum: ['owner', 'admin', 'system', 'provider'] }).notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    branchId: uuid('branch_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_entity_idx').on(t.entityType, t.entityId),
    index('audit_branch_idx').on(t.branchId, t.createdAt),
  ],
);
