CREATE TYPE "public"."agency_type" AS ENUM('ota', 'partner');--> statement-breakpoint
CREATE TYPE "public"."credit_movement_type" AS ENUM('credit', 'debit', 'refund', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('facture', 'avoir', 'proforma');--> statement-breakpoint
CREATE TYPE "public"."margin_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('transfer', 'card', 'cash', 'credit_account', 'check');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'partner_owner';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'partner_agent';--> statement-breakpoint
CREATE TABLE "partner_credit_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"movement_type" "credit_movement_type" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"reference" varchar(64),
	"reservation_id" uuid,
	"invoice_id" uuid,
	"description" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"invoice_number" varchar(32) NOT NULL,
	"invoice_type" "invoice_type" DEFAULT 'facture' NOT NULL,
	"validation_date" date,
	"line_items" jsonb,
	"total_ht" numeric(14, 2) NOT NULL,
	"total_tva" numeric(14, 2) NOT NULL,
	"total_ttc" numeric(14, 2) NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"due_date" date,
	"pdf_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"invoice_id" uuid,
	"payment_mode" "payment_mode" NOT NULL,
	"due_date" date,
	"issue_date" date,
	"original_amount" numeric(14, 2) NOT NULL,
	"remaining_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"credit_amount" numeric(14, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_margins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"module" "reservation_module" NOT NULL,
	"margin_type" "margin_type" NOT NULL,
	"margin_value" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "agency_type" "agency_type" DEFAULT 'ota' NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "matricule_fiscale" varchar(32);--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "registre_commerce" varchar(64);--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "fax" varchar(32);--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "default_language" varchar(4) DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "default_currency" varchar(3) DEFAULT 'TND' NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "mask_credit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "deposit_balance" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "credit_low_threshold" numeric(14, 2) DEFAULT '100.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_credit_movements" ADD CONSTRAINT "partner_credit_movements_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_invoices" ADD CONSTRAINT "partner_invoices_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_payments" ADD CONSTRAINT "partner_payments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_payments" ADD CONSTRAINT "partner_payments_invoice_id_partner_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."partner_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_margins" ADD CONSTRAINT "pricing_margins_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_credit_agency_idx" ON "partner_credit_movements" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "partner_credit_created_idx" ON "partner_credit_movements" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_invoices_number_uniq" ON "partner_invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "partner_invoices_agency_idx" ON "partner_invoices" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "partner_invoices_status_idx" ON "partner_invoices" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "partner_payments_agency_idx" ON "partner_payments" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "partner_payments_invoice_idx" ON "partner_payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "pricing_margins_agency_idx" ON "pricing_margins" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_margins_agency_module_uniq" ON "pricing_margins" USING btree ("agency_id","module");--> statement-breakpoint
CREATE INDEX "agencies_type_idx" ON "agencies" USING btree ("agency_type");