CREATE TYPE "public"."wallet_topup_method" AS ENUM('VIREMENT', 'MANDAT', 'ZITOUNA_PAY', 'CASH');--> statement-breakpoint
CREATE TYPE "public"."wallet_tx_status" AS ENUM('PENDING', 'VALIDATED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."wallet_tx_type" AS ENUM('CREDIT', 'DEBIT', 'REFUND', 'ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"type" "wallet_tx_type" NOT NULL,
	"method" "wallet_topup_method",
	"amount" numeric(14, 3) NOT NULL,
	"reference_number" varchar(128),
	"proof_url" text,
	"status" "wallet_tx_status" DEFAULT 'PENDING' NOT NULL,
	"reservation_id" uuid,
	"admin_note" text,
	"metadata" jsonb,
	"validated_by_user_id" uuid,
	"validated_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"balance" numeric(14, 3) DEFAULT '0.000' NOT NULL,
	"currency" varchar(3) DEFAULT 'TND' NOT NULL,
	"low_balance_threshold" numeric(14, 3) DEFAULT '100.000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_agency_id_unique" UNIQUE("agency_id")
);
--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_tx_wallet_idx" ON "wallet_transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "wallet_tx_agency_idx" ON "wallet_transactions" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "wallet_tx_status_idx" ON "wallet_transactions" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "wallet_tx_reservation_idx" ON "wallet_transactions" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "wallet_tx_created_idx" ON "wallet_transactions" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "wallets_agency_idx" ON "wallets" USING btree ("agency_id");