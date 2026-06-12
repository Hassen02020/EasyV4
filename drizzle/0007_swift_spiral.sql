CREATE TYPE "public"."inventory_lock_status" AS ENUM('active', 'confirmed', 'expired', 'released');--> statement-breakpoint
CREATE TYPE "public"."yield_rule_type" AS ENUM('percent', 'fixed', 'combined');--> statement-breakpoint
CREATE TABLE "inventory_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"redis_key" varchar(256) NOT NULL,
	"module" varchar(32) NOT NULL,
	"item_id" varchar(256) NOT NULL,
	"session_id" varchar(128) NOT NULL,
	"price_tnd" numeric(12, 3),
	"status" "inventory_lock_status" DEFAULT 'active' NOT NULL,
	"reservation_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yield_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"module" varchar(32) NOT NULL,
	"rule_type" "yield_rule_type" DEFAULT 'percent' NOT NULL,
	"percent_value" numeric(8, 4) DEFAULT '10.0000' NOT NULL,
	"fixed_value_tnd" numeric(10, 3) DEFAULT '0.000' NOT NULL,
	"min_price_tnd" numeric(10, 3) DEFAULT '0.000' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_locks" ADD CONSTRAINT "inventory_locks_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_rules" ADD CONSTRAINT "yield_rules_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inv_locks_agency_idx" ON "inventory_locks" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "inv_locks_redis_key_idx" ON "inventory_locks" USING btree ("redis_key");--> statement-breakpoint
CREATE INDEX "inv_locks_expires_idx" ON "inventory_locks" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "yield_rules_agency_module_uniq" ON "yield_rules" USING btree ("agency_id","module");--> statement-breakpoint
CREATE INDEX "yield_rules_agency_idx" ON "yield_rules" USING btree ("agency_id");