-- Night-time pricing configuration and order surcharge column.
--> statement-breakpoint
CREATE TABLE "platform_pricing_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "night_charge_enabled" boolean NOT NULL DEFAULT false,
  "night_start" text NOT NULL DEFAULT '22:00',
  "night_end" text NOT NULL DEFAULT '06:00',
  "charge_type" text NOT NULL DEFAULT 'fixed',
  "charge_amount_minor" bigint,
  "charge_percent_bps" integer,
  "timezone" text NOT NULL DEFAULT 'Asia/Kolkata',
  "updated_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_pricing_charge_type_ck" CHECK (charge_type in ('fixed', 'percent')),
  CONSTRAINT "platform_pricing_amount_ck" CHECK (
    (charge_type = 'fixed' AND (charge_amount_minor IS NULL OR charge_amount_minor >= 0) AND charge_percent_bps IS NULL) OR
    (charge_type = 'percent' AND charge_percent_bps BETWEEN 1 AND 10000 AND charge_amount_minor IS NULL)
  ),
  CONSTRAINT "platform_pricing_time_ck" CHECK (
    night_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
    night_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  )
);
--> statement-breakpoint
-- Seed the singleton config row with disabled defaults.
INSERT INTO "platform_pricing_configs"
  ("night_charge_enabled", "night_start", "night_end", "charge_type", "charge_amount_minor")
VALUES (false, '22:00', '06:00', 'fixed', 0);
--> statement-breakpoint
-- Add night_charge_minor to orders (zero for all existing rows — constraint still satisfied).
ALTER TABLE "orders" ADD COLUMN "night_charge_minor" bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Drop and recreate the total integrity constraint to include the new column.
ALTER TABLE "orders" DROP CONSTRAINT "orders_total_ck";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_ck" CHECK (
  total_minor = subtotal_minor + packaging_fee_minor + delivery_fee_minor + platform_fee_minor + tax_minor + tip_minor + night_charge_minor - discount_minor
);
