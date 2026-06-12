CREATE TYPE "public"."audit_action_type" AS ENUM('reservation.created', 'reservation.updated', 'reservation.status_changed', 'reservation.cancelled', 'reservation.refunded', 'client.created', 'client.updated', 'client.deleted', 'product.created', 'product.updated', 'product.deleted', 'product.price_changed', 'product.status_changed', 'payment.processed', 'payment.refunded', 'invoice.generated', 'user.login', 'user.logout', 'user.password_changed', 'user.role_changed', 'staff.created', 'staff.updated', 'staff.deleted', 'config.changed');--> statement-breakpoint
CREATE TYPE "public"."audit_entity_type" AS ENUM('reservation', 'client', 'product', 'payment', 'invoice', 'user', 'agency', 'config');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('hotel', 'flight', 'package', 'activity', 'transfer', 'omra', 'car');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid,
	"user_email" varchar(255),
	"user_role" varchar(32),
	"action" "audit_action_type" NOT NULL,
	"entity_type" "audit_entity_type" NOT NULL,
	"entity_id" varchar(64),
	"old_value" jsonb,
	"new_value" jsonb,
	"changes" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"sku" varchar(64) NOT NULL,
	"type" "product_type" NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"name" varchar(255) NOT NULL,
	"short_description" text,
	"long_description" text,
	"destination" varchar(128),
	"country" varchar(64),
	"city" varchar(64),
	"base_price" numeric(12, 3) NOT NULL,
	"currency" varchar(3) DEFAULT 'TND' NOT NULL,
	"vat_rate" numeric(4, 2) DEFAULT '7',
	"stock" integer,
	"attributes" jsonb,
	"seo_meta" jsonb,
	"margin_config" jsonb,
	"valid_from" date,
	"valid_until" date,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_agency_idx" ON "audit_logs" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_agency_created_idx" ON "audit_logs" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_sku_agency_idx" ON "products" USING btree ("agency_id","sku");--> statement-breakpoint
CREATE INDEX "product_type_idx" ON "products" USING btree ("type");--> statement-breakpoint
CREATE INDEX "product_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "product_destination_idx" ON "products" USING btree ("destination");--> statement-breakpoint
CREATE INDEX "product_gin_idx" ON "products" USING btree ("agency_id",to_tsvector('french', "name" || ' ' || COALESCE("short_description", '')));