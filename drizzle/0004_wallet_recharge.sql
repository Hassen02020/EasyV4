CREATE TYPE "public"."recharge_method" AS ENUM('cash', 'bank_transfer', 'postal_transfer', 'postal_mandate', 'check', 'card_international');--> statement-breakpoint
CREATE TYPE "public"."recharge_status" AS ENUM('pending', 'validated', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."payment_psp" ADD VALUE 'stripe' BEFORE 'manual';--> statement-breakpoint
CREATE TABLE "wallet_recharge_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"amount" numeric(12, 3) NOT NULL,
	"method" "recharge_method" NOT NULL,
	"payment_reference" varchar(128),
	"proof_url" text,
	"note" text,
	"status" "recharge_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" uuid,
	"rejection_reason" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_recharge_requests" ADD CONSTRAINT "wallet_recharge_requests_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_recharge_requests" ADD CONSTRAINT "wallet_recharge_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recharge_req_agency_idx" ON "wallet_recharge_requests" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "recharge_req_status_idx" ON "wallet_recharge_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recharge_req_created_idx" ON "wallet_recharge_requests" USING btree ("created_at");