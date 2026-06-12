CREATE TABLE "payment_events" (
	"event_id" varchar(128) PRIMARY KEY NOT NULL,
	"provider" varchar(16) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"reservation_id" uuid,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pmt_events_provider_idx" ON "payment_events" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "pmt_events_processed_idx" ON "payment_events" USING btree ("processed_at");