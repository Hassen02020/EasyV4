CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'approve', 'reject', 'cancel', 'complete', 'refund', 'login', 'logout', 'password_change', 'role_change');--> statement-breakpoint
CREATE TYPE "public"."inventory_status" AS ENUM('available', 'limited', 'on_request', 'sold_out');--> statement-breakpoint
CREATE TYPE "public"."journal_entry_status" AS ENUM('draft', 'posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."reservation_transition" AS ENUM('create', 'submit_payment', 'payment_success', 'payment_fail', 'provider_confirm', 'provider_reject', 'cancel', 'complete', 'refund');--> statement-breakpoint
CREATE TYPE "public"."supplier_status" AS ENUM('active', 'inactive', 'maintenance', 'error');--> statement-breakpoint
CREATE TYPE "public"."supplier_type" AS ENUM('mygo', 'amadeus', 'sabre', 'expedia', 'booking', 'travelgate', 'hotelbeds', 'custom');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('pending', 'pending_supplier', 'pending_payment', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."validation_step" AS ENUM('initial', 'supplier_check', 'availability_check', 'price_verification', 'payment_verification', 'final_approval');--> statement-breakpoint
CREATE TYPE "public"."wallet_account_type" AS ENUM('credit', 'debit', 'escrow', 'commission');--> statement-breakpoint
CREATE TYPE "public"."wallet_tx_status_v6" AS ENUM('pending', 'completed', 'reversed');--> statement-breakpoint
ALTER TYPE "public"."margin_type" ADD VALUE 'hybrid';--> statement-breakpoint
CREATE TABLE "api_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid,
	"operation" varchar(50) NOT NULL,
	"module" varchar(50) NOT NULL,
	"request_payload" text,
	"request_headers" jsonb,
	"request_url" text,
	"request_method" varchar(10),
	"response_payload" text,
	"response_headers" jsonb,
	"status_code" integer,
	"duration_ms" integer,
	"success" boolean DEFAULT false NOT NULL,
	"error_type" varchar(100),
	"error_message" text,
	"error_code" varchar(50),
	"reservation_id" uuid,
	"product_id" uuid,
	"session_id" varchar(100),
	"environment" varchar(20) DEFAULT 'production',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"reference" varchar(50) NOT NULL,
	"reference_type" varchar(50) NOT NULL,
	"entry_date" date NOT NULL,
	"description" text NOT NULL,
	"total_debit" numeric(14, 2) NOT NULL,
	"total_credit" numeric(14, 2) NOT NULL,
	"status" "journal_entry_status" DEFAULT 'posted' NOT NULL,
	"created_by" uuid,
	"reversed_by" uuid,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"account_code" varchar(20) NOT NULL,
	"account_name" varchar(200) NOT NULL,
	"debit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"reservation_id" uuid,
	"wallet_ledger_id" uuid,
	"invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "margin_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"supplier_id" uuid,
	"product_type" varchar(50),
	"destination" varchar(100),
	"min_price" numeric(14, 2),
	"max_price" numeric(14, 2),
	"type" "margin_type" DEFAULT 'percent' NOT NULL,
	"percent_value" numeric(5, 2),
	"fixed_value" numeric(14, 2),
	"commission_percent" numeric(5, 2),
	"priority" integer DEFAULT 0 NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"name" varchar(200) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"date" date NOT NULL,
	"end_date" date,
	"total_capacity" integer NOT NULL,
	"available" integer DEFAULT 0 NOT NULL,
	"on_hold" integer DEFAULT 0 NOT NULL,
	"confirmed" integer DEFAULT 0 NOT NULL,
	"price" numeric(14, 2),
	"currency" varchar(3) DEFAULT 'TND',
	"status" "inventory_status" DEFAULT 'available' NOT NULL,
	"supplier_stock" integer,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_financials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"supplier_price" numeric(14, 2) NOT NULL,
	"supplier_currency" varchar(3) NOT NULL,
	"supplier_price_tnd" numeric(14, 2) NOT NULL,
	"sale_price" numeric(14, 2) NOT NULL,
	"sale_currency" varchar(3) NOT NULL,
	"sale_price_tnd" numeric(14, 2) NOT NULL,
	"margin_amount" numeric(14, 2) NOT NULL,
	"margin_percent" numeric(5, 2) NOT NULL,
	"margin_rule_id" uuid,
	"commission_amount" numeric(14, 2) DEFAULT '0',
	"commission_percent" numeric(5, 2) DEFAULT '0',
	"exchange_rate" numeric(10, 6) DEFAULT '1',
	"exchange_rate_at" timestamp with time zone,
	"journal_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50) NOT NULL,
	"transition" "reservation_transition" NOT NULL,
	"triggered_by" uuid,
	"automated" boolean DEFAULT false NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"status" "validation_status" DEFAULT 'pending' NOT NULL,
	"current_step" "validation_step" DEFAULT 'initial' NOT NULL,
	"supplier_id" uuid,
	"supplier_reference" varchar(100),
	"availability_checked" boolean DEFAULT false NOT NULL,
	"availability_confirmed" boolean,
	"availability_message" text,
	"price_verified" boolean DEFAULT false NOT NULL,
	"original_price" varchar(20),
	"verified_price" varchar(20),
	"price_difference" varchar(20),
	"payment_verified" boolean DEFAULT false NOT NULL,
	"payment_method" varchar(50),
	"payment_reference" varchar(100),
	"rejection_reason" text,
	"rejection_category" varchar(50),
	"metadata" jsonb,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"level" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"duration" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"module" varchar(50) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" "supplier_type" NOT NULL,
	"status" "supplier_status" DEFAULT 'inactive' NOT NULL,
	"api_url" text,
	"api_key" text,
	"api_secret" text,
	"api_username" text,
	"api_password" text,
	"xml_endpoint" text,
	"xml_namespace" text,
	"xml_version" varchar(20),
	"config" jsonb,
	"logo_url" text,
	"website" text,
	"support_email" varchar(320),
	"support_phone" varchar(32),
	"last_sync_at" timestamp with time zone,
	"sync_interval" varchar(20) DEFAULT '1h',
	"auto_sync" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"comment" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validation_id" uuid NOT NULL,
	"from_status" "validation_status",
	"to_status" "validation_status" NOT NULL,
	"from_step" "validation_step",
	"to_step" "validation_step",
	"user_id" uuid,
	"automated" boolean DEFAULT false NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"type" "wallet_account_type" DEFAULT 'credit' NOT NULL,
	"current_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'TND' NOT NULL,
	"credit_limit" numeric(14, 2),
	"alert_threshold" numeric(14, 2),
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_account_id" uuid NOT NULL,
	"type" "wallet_tx_type" NOT NULL,
	"status" "wallet_tx_status_v6" DEFAULT 'completed' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"balance_before" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"reservation_id" uuid,
	"payment_id" uuid,
	"recharge_request_id" uuid,
	"invoice_id" uuid,
	"description" text NOT NULL,
	"category" varchar(50),
	"metadata" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_ledger" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."wallet_tx_type";--> statement-breakpoint
CREATE TYPE "public"."wallet_tx_type" AS ENUM('credit', 'debit', 'refund', 'adjustment', 'commission', 'escrow_in', 'escrow_out');--> statement-breakpoint
ALTER TABLE "wallet_ledger" ALTER COLUMN "type" SET DATA TYPE "public"."wallet_tx_type" USING "type"::"public"."wallet_tx_type";--> statement-breakpoint
-- wallet_transactions is a pre-existing table that may hold legacy UPPERCASE
-- values (CREDIT/DEBIT/REFUND/ADJUSTMENT) from before the enum fusion. A blind
-- cast fails on those rows, so map them explicitly instead of trusting a
-- straight ::wallet_tx_type cast.
ALTER TABLE "wallet_transactions" ALTER COLUMN "type" SET DATA TYPE "public"."wallet_tx_type" USING (CASE "type"
	WHEN 'CREDIT' THEN 'credit'
	WHEN 'DEBIT' THEN 'debit'
	WHEN 'REFUND' THEN 'refund'
	WHEN 'ADJUSTMENT' THEN 'adjustment'
	ELSE "type"
END)::"public"."wallet_tx_type";--> statement-breakpoint
ALTER TABLE "wallet_transactions" ALTER COLUMN "amount" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_inventory" ADD CONSTRAINT "product_inventory_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_logs" ADD CONSTRAINT "supplier_logs_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_modules" ADD CONSTRAINT "supplier_modules_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_comments" ADD CONSTRAINT "validation_comments_validation_id_reservation_validations_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."reservation_validations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_history" ADD CONSTRAINT "validation_history_validation_id_reservation_validations_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."reservation_validations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_inventory_product_date_idx" ON "product_inventory" USING btree ("product_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_financials_reservation_idx" ON "reservation_financials" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_accounts_agency_type_idx" ON "wallet_accounts" USING btree ("agency_id","type");