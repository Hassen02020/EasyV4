-- Flight Supplier Configs — Easy2Book
-- Configures DISPLAY_MODE (SITE/API) and BOOKING_MODE (OFFLINE/API/AUTOMATIC)
-- per supplier per agency scope. Credentials are stored encrypted in a
-- separate table (same ciphertext+keyVersion pattern as hotel_supplier_credentials).
-- Super Admin sets this up; the adapters read it at runtime.

--> statement-breakpoint
CREATE TYPE "public"."flight_display_mode" AS ENUM('SITE', 'API');

--> statement-breakpoint
CREATE TYPE "public"."flight_booking_mode" AS ENUM('OFFLINE', 'API', 'AUTOMATIC');

--> statement-breakpoint
CREATE TYPE "public"."flight_supplier_name" AS ENUM(
  'virtual',
  'amadeus',
  'travelport',
  'sabre'
);

-- ── flight_supplier_configs ───────────────────────────────────────────────────
-- One row per (agency_scope, supplier) combination. agency_id always
-- references a real agencies row — master OTA, whitelabel, or partner.
-- display_url is only relevant when display_mode = 'SITE'.

--> statement-breakpoint
CREATE TABLE "flight_supplier_configs" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id"        uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  "supplier"         "flight_supplier_name" NOT NULL,
  "display_mode"     "flight_display_mode"  NOT NULL DEFAULT 'API',
  "display_url"      text,           -- only for SITE mode; NOT NULL enforced at app level
  "booking_mode"     "flight_booking_mode"  NOT NULL DEFAULT 'OFFLINE',
  "active"           boolean NOT NULL DEFAULT true,
  "priority"         integer NOT NULL DEFAULT 100,  -- lower = higher priority
  "api_enabled"      boolean NOT NULL DEFAULT false, -- quick kill-switch for API mode
  "created_by_user_id" uuid,
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"       timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX "flight_supplier_configs_agency_supplier_uniq"
  ON "flight_supplier_configs"("agency_id", "supplier");

--> statement-breakpoint
CREATE INDEX "flight_supplier_configs_agency_idx" ON "flight_supplier_configs"("agency_id");
CREATE INDEX "flight_supplier_configs_active_idx"  ON "flight_supplier_configs"("active");

-- ── flight_supplier_credentials ───────────────────────────────────────────────
-- API credentials, always encrypted (same ciphertext+keyVersion pattern as
-- hotel_supplier_credentials / lib/security/secret-crypto.ts).
-- Separate table so no SELECT on flight_supplier_configs ever leaks secrets.

--> statement-breakpoint
CREATE TABLE "flight_supplier_credentials" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "config_id"          uuid NOT NULL UNIQUE REFERENCES flight_supplier_configs(id) ON DELETE CASCADE,
  "agency_id"          uuid NOT NULL,   -- denormalised from config for RLS scoping without join
  "ciphertext"         text NOT NULL,
  "key_version"        integer NOT NULL DEFAULT 1,
  "updated_by_user_id" uuid,
  "created_at"         timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"         timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX "flight_supplier_credentials_agency_idx" ON "flight_supplier_credentials"("agency_id");
