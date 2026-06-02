ALTER TABLE "agencies" ALTER COLUMN "deposit_balance" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "agencies" ALTER COLUMN "deposit_balance" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "agencies" ALTER COLUMN "credit_low_threshold" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "agencies" ALTER COLUMN "credit_low_threshold" SET DEFAULT '100.000';--> statement-breakpoint
ALTER TABLE "partner_credit_movements" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "partner_credit_movements" ALTER COLUMN "balance_after" SET DATA TYPE numeric(12, 3);