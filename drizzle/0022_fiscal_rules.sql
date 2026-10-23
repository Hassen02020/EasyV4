CREATE TABLE "fiscal_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" varchar(2) NOT NULL,
	"module" varchar(32) NOT NULL,
	"fiscal_classification" varchar(16) NOT NULL,
	"vat_rate" numeric(5, 2) NOT NULL,
	"status" varchar(8) DEFAULT 'draft' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"version" integer NOT NULL,
	"validation_ref" text,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_by" uuid,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "fiscal_rules_lookup_idx" ON "fiscal_rules" USING btree ("country","module","status","effective_from");--> statement-breakpoint
CREATE INDEX "fiscal_rules_status_idx" ON "fiscal_rules" USING btree ("status");