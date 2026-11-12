CREATE TABLE "admin_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_accounts_role_ck" CHECK (role in ('super_admin', 'operations', 'finance', 'support'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"branch_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"refresh_hash" text NOT NULL,
	"previous_refresh_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"user_agent" text,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"opens_at" text NOT NULL,
	"closes_at" text NOT NULL,
	CONSTRAINT "branch_hours_day_ck" CHECK (day_of_week between 0 and 6),
	CONSTRAINT "branch_hours_time_ck" CHECK (opens_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and closes_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cuisines" text[] DEFAULT '{}'::text[] NOT NULL,
	"food_type" text DEFAULT 'mixed' NOT NULL,
	"phone_e164" text,
	"email" text,
	"address_line1" text,
	"address_line2" text,
	"locality" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"latitude" double precision,
	"longitude" double precision,
	"location_source" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"status_reason" text,
	"is_accepting_orders" boolean DEFAULT false NOT NULL,
	"paused_until" timestamp with time zone,
	"pause_reason" text,
	"avg_prep_minutes" integer DEFAULT 20 NOT NULL,
	"min_order_minor" bigint DEFAULT 0 NOT NULL,
	"packaging_fee_minor" bigint DEFAULT 0 NOT NULL,
	"commission_bps" integer,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_status_ck" CHECK (status in ('draft', 'pending_review', 'active', 'suspended', 'rejected', 'closed')),
	CONSTRAINT "branches_food_type_ck" CHECK (food_type in ('veg_only', 'mixed')),
	CONSTRAINT "branches_location_ck" CHECK ((latitude is null) = (longitude is null) and (latitude is null or (latitude between 6 and 38 and longitude between 68 and 98))),
	CONSTRAINT "branches_prep_ck" CHECK (avg_prep_minutes between 5 and 120),
	CONSTRAINT "branches_money_ck" CHECK (min_order_minor >= 0 and packaging_fee_minor >= 0),
	CONSTRAINT "branches_commission_ck" CHECK (commission_bps is null or commission_bps between 0 and 5000)
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"legal_name" text NOT NULL,
	"entity_type" text NOT NULL,
	"gstin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_entity_ck" CHECK (entity_type in ('individual', 'partnership', 'llp', 'company', 'other'))
);
--> statement-breakpoint
CREATE TABLE "coupon_branches" (
	"coupon_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_items" (
	"coupon_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"discount_type" text NOT NULL,
	"percent_bps" integer,
	"flat_minor" bigint,
	"max_discount_minor" bigint,
	"min_order_minor" bigint DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"usage_limit_total" integer,
	"usage_limit_per_customer" integer,
	"approval_status" text NOT NULL,
	"approval_route" text NOT NULL,
	"review_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"rejection_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"redemptions" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_status_ck" CHECK (approval_status in ('pending_approval', 'approved', 'rejected', 'cancelled')),
	CONSTRAINT "coupons_discount_ck" CHECK ((discount_type = 'percent' and percent_bps between 100 and 10000 and flat_minor is null) or (discount_type = 'flat' and flat_minor >= 100 and percent_bps is null)),
	CONSTRAINT "coupons_window_ck" CHECK (ends_at > starts_at),
	CONSTRAINT "coupons_manual_review_ck" CHECK (approval_route = 'manual' or approval_status <> 'pending_approval')
);
--> statement-breakpoint
CREATE TABLE "declaration_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"version" text NOT NULL,
	"text_sha256" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"type" text NOT NULL,
	"document_number" text,
	"expires_on" date,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"rejection_reason" text,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "documents_type_ck" CHECK (type in ('fssai_license', 'bank_proof', 'gst_certificate', 'pan_card', 'shop_establishment', 'other')),
	CONSTRAINT "documents_status_ck" CHECK (status in ('pending_review', 'approved', 'rejected', 'expired', 'superseded')),
	CONSTRAINT "documents_review_ck" CHECK ((status in ('approved','rejected')) = (reviewed_at is not null) or status in ('expired','superseded')),
	CONSTRAINT "documents_reject_reason_ck" CHECK (status <> 'rejected' or rejection_reason is not null)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"description" text NOT NULL,
	"order_id" uuid,
	"payout_id" uuid,
	"available_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"is_dev_fixture" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_type_ck" CHECK (type in ('order_earning', 'commission', 'commission_tax', 'restaurant_discount', 'refund_deduction', 'adjustment', 'payout', 'payout_reversal')),
	CONSTRAINT "ledger_nonzero_ck" CHECK (amount_minor <> 0)
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_minor" bigint NOT NULL,
	"food_type" text NOT NULL,
	"image_key" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"is_bestseller" boolean DEFAULT false NOT NULL,
	"prep_minutes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_price_ck" CHECK (price_minor between 100 and 5000000),
	CONSTRAINT "menu_items_food_type_ck" CHECK (food_type in ('veg', 'non_veg', 'egg', 'jain'))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"menu_item_id" uuid,
	"name" text NOT NULL,
	"food_type" text NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	CONSTRAINT "order_items_qty_ck" CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE TABLE "order_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_user_id" uuid,
	"customer_first_name" text NOT NULL,
	"customer_phone_masked" text,
	"delivery_locality" text,
	"delivery_distance_meters" integer,
	"rider_first_name" text,
	"instructions" text,
	"status" text NOT NULL,
	"payment_method" text NOT NULL,
	"payment_status" text NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"packaging_fee_minor" bigint DEFAULT 0 NOT NULL,
	"delivery_fee_minor" bigint DEFAULT 0 NOT NULL,
	"platform_fee_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"tip_minor" bigint DEFAULT 0 NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"restaurant_discount_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"coupon_id" uuid,
	"prep_minutes" integer,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accept_by" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"is_dev_fixture" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_status_ck" CHECK (status in ('pending_payment', 'placed', 'preparing', 'ready_for_pickup', 'picked_up', 'delivered', 'cancelled')),
	CONSTRAINT "orders_payment_status_ck" CHECK (payment_status in ('pending', 'paid', 'failed', 'refund_pending', 'partially_refunded', 'refunded', 'not_applicable')),
	CONSTRAINT "orders_total_ck" CHECK (total_minor = subtotal_minor + packaging_fee_minor + delivery_fee_minor + platform_fee_minor + tax_minor + tip_minor - discount_minor),
	CONSTRAINT "orders_restaurant_discount_ck" CHECK (restaurant_discount_minor between 0 and discount_minor)
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"identifier" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_accounts_role_ck" CHECK (role in ('owner', 'manager_legacy'))
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"account_holder_name" text NOT NULL,
	"account_last4" text NOT NULL,
	"ifsc" text NOT NULL,
	"account_number_ciphertext" text,
	"account_fingerprint" text NOT NULL,
	"provider" text DEFAULT 'razorpayx' NOT NULL,
	"provider_contact_id" text,
	"provider_fund_account_id" text,
	"provider_validation_id" text,
	"status" text DEFAULT 'pending_verification' NOT NULL,
	"registered_name" text,
	"failure_reason" text,
	"verified_at" timestamp with time zone,
	"verified_via" text,
	"verified_by" uuid,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_accounts_status_ck" CHECK (status in ('pending_verification', 'verification_in_progress', 'verified', 'failed', 'disabled')),
	CONSTRAINT "payout_accounts_verified_ck" CHECK ((status = 'verified') = (verified_at is not null))
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"payout_account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"provider" text DEFAULT 'razorpayx' NOT NULL,
	"provider_mode" text NOT NULL,
	"provider_payout_id" text,
	"utr" text,
	"failure_reason" text,
	"idempotency_key" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"provider_attempts" integer DEFAULT 0 NOT NULL,
	"last_provider_sync_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_status_ck" CHECK (status in ('requested', 'queued', 'pending_approval', 'processing', 'processed', 'failed', 'reversed', 'cancelled', 'rejected')),
	CONSTRAINT "payouts_amount_ck" CHECK (amount_minor >= 100)
);
--> statement-breakpoint
CREATE TABLE "provider_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "review_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"reported_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid,
	"rating" smallint NOT NULL,
	"comment" text,
	"customer_display_name" text NOT NULL,
	"moderation_status" text DEFAULT 'visible' NOT NULL,
	"is_dev_fixture" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_ck" CHECK (rating between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text,
	"email" text,
	"full_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status_ck" CHECK (status in ('active', 'suspended', 'deleted')),
	CONSTRAINT "users_identity_ck" CHECK (phone_e164 is not null or email is not null)
);
--> statement-breakpoint
ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_closures" ADD CONSTRAINT "branch_closures_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_hours" ADD CONSTRAINT "branch_hours_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_branches" ADD CONSTRAINT "coupon_branches_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_branches" ADD CONSTRAINT "coupon_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_items" ADD CONSTRAINT "coupon_items_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_items" ADD CONSTRAINT "coupon_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_acceptances" ADD CONSTRAINT "declaration_acceptances_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_acceptances" ADD CONSTRAINT "declaration_acceptances_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_acceptances" ADD CONSTRAINT "declaration_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_accounts" ADD CONSTRAINT "partner_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payout_account_id_payout_accounts_id_fk" FOREIGN KEY ("payout_account_id") REFERENCES "public"."payout_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_branch_idx" ON "audit_logs" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_refresh_uq" ON "auth_sessions" USING btree ("refresh_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_prev_idx" ON "auth_sessions" USING btree ("previous_refresh_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branch_closures_uq" ON "branch_closures" USING btree ("branch_id","date");--> statement-breakpoint
CREATE INDEX "branch_hours_branch_idx" ON "branch_hours" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "branches_business_idx" ON "branches" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "branches_status_idx" ON "branches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_owner_uq" ON "businesses" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_branches_uq" ON "coupon_branches" USING btree ("coupon_id","branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_items_uq" ON "coupon_items" USING btree ("coupon_id","menu_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_live_uq" ON "coupons" USING btree ("business_id","code") WHERE approval_status in ('pending_approval','approved');--> statement-breakpoint
CREATE UNIQUE INDEX "declaration_branch_version_uq" ON "declaration_acceptances" USING btree ("branch_id","version");--> statement-breakpoint
CREATE INDEX "documents_branch_type_idx" ON "documents" USING btree ("branch_id","type");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ledger_branch_created_idx" ON "ledger_entries" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_order_type_uq" ON "ledger_entries" USING btree ("order_id","type") WHERE order_id is not null and type in ('order_earning','commission','commission_tax','restaurant_discount');--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_payout_type_uq" ON "ledger_entries" USING btree ("payout_id","type") WHERE payout_id is not null;--> statement-breakpoint
CREATE INDEX "menu_categories_branch_idx" ON "menu_categories" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "menu_items_branch_idx" ON "menu_items" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "menu_items_category_idx" ON "menu_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_status_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_uq" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_branch_placed_idx" ON "orders" USING btree ("branch_id","placed_at");--> statement-breakpoint
CREATE INDEX "orders_branch_status_idx" ON "orders" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "otp_identifier_idx" ON "otp_challenges" USING btree ("identifier","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_accounts_current_uq" ON "payout_accounts" USING btree ("branch_id") WHERE is_current;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_accounts_validation_uq" ON "payout_accounts" USING btree ("provider_validation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_idempotency_uq" ON "payouts" USING btree ("branch_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_provider_id_uq" ON "payouts" USING btree ("provider_payout_id");--> statement-breakpoint
CREATE INDEX "payouts_branch_idx" ON "payouts" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_uq" ON "provider_webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_replies_review_uq" ON "review_replies" USING btree ("review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_reports_open_uq" ON "review_reports" USING btree ("review_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "reviews_branch_idx" ON "reviews" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_uq" ON "reviews" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");