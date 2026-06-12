CREATE TYPE "public"."payment_method" AS ENUM('card', 'wallet', 'transfer', 'cash', 'at_hotel');--> statement-breakpoint
CREATE TYPE "public"."payment_psp" AS ENUM('sps', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'authorized', 'captured', 'failed', 'refunded', 'partial_refund');--> statement-breakpoint
CREATE TYPE "public"."reservation_module" AS ENUM('hotel', 'flight', 'package', 'activity', 'transfer', 'omra');--> statement-breakpoint
CREATE TYPE "public"."reservation_source" AS ENUM('mygo', 'internal', 'amadeus', 'sabre', 'expedia', 'manual');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'on_request', 'confirmed', 'cancelled', 'no_show', 'completed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."transfer_vehicle_type" AS ENUM('sedan', 'van', 'minibus', 'bus', 'luxury');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'manager', 'agent_resa', 'agent_compta', 'agent_excursions');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"brand_name" varchar(200),
	"contact_email" varchar(320),
	"contact_phone" varchar(32),
	"display_currencies" text[] DEFAULT ARRAY['TND','EUR','USD']::text[] NOT NULL,
	"settlement_currencies" text[] DEFAULT ARRAY['TND']::text[] NOT NULL,
	"default_vat_rate" numeric(5, 2) DEFAULT '19.00' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" text NOT NULL,
	"action" varchar(32) NOT NULL,
	"diff" jsonb,
	"ip_address" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"title" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"short_description" text,
	"long_description" text,
	"location" varchar(200),
	"duration_minutes" integer,
	"cover_image" text,
	"gallery_urls" text[],
	"inclusions" text[],
	"exclusions" text[],
	"tariff_rules" jsonb,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_activity_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"session_start" varchar(5) NOT NULL,
	"session_end" varchar(5) NOT NULL,
	"capacity" integer NOT NULL,
	"booked" integer DEFAULT 0 NOT NULL,
	"adult_price_tnd" numeric(14, 2) NOT NULL,
	"child_price_tnd" numeric(14, 2),
	"senior_price_tnd" numeric(14, 2),
	"status" varchar(16) DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"license_number" varchar(64),
	"languages" text[],
	"status" varchar(16) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_package_departures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"departure_date" date NOT NULL,
	"return_date" date NOT NULL,
	"adult_price_tnd" numeric(14, 2) NOT NULL,
	"child_price_tnd" numeric(14, 2),
	"deposit_percent" integer DEFAULT 30 NOT NULL,
	"total_seats" integer NOT NULL,
	"booked_seats" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"title" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"short_description" text,
	"long_description" text,
	"itinerary" jsonb,
	"cover_image" text,
	"gallery_urls" text[],
	"departure_locations" text[],
	"transport_mode" varchar(32),
	"duration_days" integer,
	"duration_nights" integer,
	"inclusions" text[],
	"exclusions" text[],
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_transfer_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"from_zone_id" uuid NOT NULL,
	"to_zone_id" uuid NOT NULL,
	"vehicle_type" "transfer_vehicle_type" NOT NULL,
	"base_price_tnd" numeric(14, 2) NOT NULL,
	"night_surcharge_percent" integer DEFAULT 0 NOT NULL,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "catalog_transfer_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"zone_type" varchar(16) NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"status" varchar(16) DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"type" "transfer_vehicle_type" NOT NULL,
	"capacity" integer NOT NULL,
	"plate" varchar(32) NOT NULL,
	"brand" varchar(64),
	"model" varchar(64),
	"color" varchar(32),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" varchar(3) PRIMARY KEY NOT NULL,
	"symbol" varchar(8) NOT NULL,
	"name" varchar(100) NOT NULL,
	"decimals" integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"auth_user_id" uuid,
	"civility" varchar(8),
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(320),
	"phone" varchar(32),
	"civic_id" varchar(64),
	"civic_id_type" varchar(16),
	"birth_date" date,
	"nationality" varchar(64),
	"country" varchar(64),
	"city" varchar(100),
	"address" text,
	"language" varchar(8) DEFAULT 'fr',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"from_code" varchar(3) NOT NULL,
	"to_code" varchar(3) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"psp" "payment_psp" NOT NULL,
	"method" "payment_method" NOT NULL,
	"psp_order_id" varchar(64),
	"psp_transaction_id" varchar(64),
	"original_currency" varchar(3) NOT NULL,
	"original_amount" numeric(14, 2) NOT NULL,
	"tnd_amount" numeric(14, 2) NOT NULL,
	"kind" varchar(16) DEFAULT 'deposit' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"card_brand" varchar(16),
	"card_last4" varchar(4),
	"three_ds_ok" boolean,
	"raw_response" jsonb,
	"refunded_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"captured_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psp_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid,
	"psp" "payment_psp" NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_ok" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_activity" (
	"reservation_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"session_start" varchar(5),
	"session_end" varchar(5),
	"adults" integer DEFAULT 0 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"seniors" integer DEFAULT 0 NOT NULL,
	"e_ticket_url" text,
	"qr_code" text,
	"scanned_at" timestamp with time zone,
	"scanned_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "reservation_flight" (
	"reservation_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"pnr" varchar(16),
	"origin" varchar(8) NOT NULL,
	"destination" varchar(8) NOT NULL,
	"depart_at" timestamp with time zone NOT NULL,
	"arrive_at" timestamp with time zone,
	"return_origin" varchar(8),
	"return_destination" varchar(8),
	"return_depart_at" timestamp with time zone,
	"return_arrive_at" timestamp with time zone,
	"cabin_class" varchar(16),
	"adults" integer NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"infants" integer DEFAULT 0 NOT NULL,
	"e_ticket_urls" text[],
	"segments" jsonb
);
--> statement-breakpoint
CREATE TABLE "reservation_hotel" (
	"reservation_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"provider_booking_id" varchar(64),
	"provider_token" text,
	"hotel_id" integer NOT NULL,
	"hotel_name" varchar(200) NOT NULL,
	"city_id" integer,
	"city_name" varchar(100),
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"nights" integer NOT NULL,
	"adults" integer NOT NULL,
	"children_ages" integer[],
	"board_code" varchar(16),
	"board_name" varchar(100),
	"rooms" jsonb,
	"method_payment" integer,
	"at_hotel_amount" numeric(14, 2),
	"cancellation_policies" jsonb
);
--> statement-breakpoint
CREATE TABLE "reservation_omra" (
	"reservation_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"omra_package_id" uuid NOT NULL,
	"departure_date" date NOT NULL,
	"return_date" date NOT NULL,
	"pilgrims" integer NOT NULL,
	"travelers" jsonb,
	"visa_status" varchar(16)
);
--> statement-breakpoint
CREATE TABLE "reservation_package" (
	"reservation_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"departure_id" uuid NOT NULL,
	"departure_date" date NOT NULL,
	"return_date" date NOT NULL,
	"adults" integer NOT NULL,
	"children_ages" integer[],
	"travelers" jsonb,
	"programme_url" text
);
--> statement-breakpoint
CREATE TABLE "reservation_transfer" (
	"reservation_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"pickup_zone_id" uuid,
	"dropoff_zone_id" uuid,
	"pickup_address" text,
	"dropoff_address" text,
	"flight_number" varchar(16),
	"flight_arrival_at" timestamp with time zone,
	"flight_status" varchar(32),
	"pax" integer NOT NULL,
	"luggage_count" integer DEFAULT 0 NOT NULL,
	"vehicle_type" "transfer_vehicle_type" NOT NULL,
	"vehicle_assigned_id" uuid,
	"driver_assigned_id" uuid,
	"driver_phone" varchar(32),
	"sms_sid" varchar(64),
	"sms_status" varchar(16),
	"status_timeline" jsonb
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"public_ref" varchar(32) NOT NULL,
	"customer_id" uuid NOT NULL,
	"module" "reservation_module" NOT NULL,
	"source" "reservation_source" NOT NULL,
	"status" "reservation_status" DEFAULT 'pending' NOT NULL,
	"original_currency" varchar(3) NOT NULL,
	"original_amount" numeric(14, 2) NOT NULL,
	"tnd_amount" numeric(14, 2) NOT NULL,
	"deposit_amount" numeric(14, 2),
	"deposit_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"voucher_url" text,
	"voucher_qr" text,
	"notes" text,
	"provider_payload" jsonb,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(200),
	"role" "user_role" DEFAULT 'agent_resa' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_activities" ADD CONSTRAINT "catalog_activities_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_activity_sessions" ADD CONSTRAINT "catalog_activity_sessions_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_activity_sessions" ADD CONSTRAINT "catalog_activity_sessions_activity_id_catalog_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."catalog_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_drivers" ADD CONSTRAINT "catalog_drivers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_package_departures" ADD CONSTRAINT "catalog_package_departures_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_package_departures" ADD CONSTRAINT "catalog_package_departures_package_id_catalog_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."catalog_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_packages" ADD CONSTRAINT "catalog_packages_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_transfer_pricing" ADD CONSTRAINT "catalog_transfer_pricing_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_transfer_pricing" ADD CONSTRAINT "catalog_transfer_pricing_from_zone_id_catalog_transfer_zones_id_fk" FOREIGN KEY ("from_zone_id") REFERENCES "public"."catalog_transfer_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_transfer_pricing" ADD CONSTRAINT "catalog_transfer_pricing_to_zone_id_catalog_transfer_zones_id_fk" FOREIGN KEY ("to_zone_id") REFERENCES "public"."catalog_transfer_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_transfer_zones" ADD CONSTRAINT "catalog_transfer_zones_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_vehicles" ADD CONSTRAINT "catalog_vehicles_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_from_code_currencies_code_fk" FOREIGN KEY ("from_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_to_code_currencies_code_fk" FOREIGN KEY ("to_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_activity" ADD CONSTRAINT "reservation_activity_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_activity" ADD CONSTRAINT "reservation_activity_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_flight" ADD CONSTRAINT "reservation_flight_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_flight" ADD CONSTRAINT "reservation_flight_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_hotel" ADD CONSTRAINT "reservation_hotel_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_hotel" ADD CONSTRAINT "reservation_hotel_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_omra" ADD CONSTRAINT "reservation_omra_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_omra" ADD CONSTRAINT "reservation_omra_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_package" ADD CONSTRAINT "reservation_package_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_package" ADD CONSTRAINT "reservation_package_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_transfer" ADD CONSTRAINT "reservation_transfer_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_transfer" ADD CONSTRAINT "reservation_transfer_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agencies_slug_uniq" ON "agencies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "audit_agency_idx" ON "audit_events" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_act_slug_uniq" ON "catalog_activities" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE INDEX "catalog_act_agency_idx" ON "catalog_activities" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "catalog_act_sess_agency_idx" ON "catalog_activity_sessions" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "catalog_act_sess_date_idx" ON "catalog_activity_sessions" USING btree ("activity_id","session_date");--> statement-breakpoint
CREATE INDEX "catalog_drivers_agency_idx" ON "catalog_drivers" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "catalog_pkg_dep_agency_idx" ON "catalog_package_departures" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "catalog_pkg_dep_package_idx" ON "catalog_package_departures" USING btree ("package_id","departure_date");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_pkg_slug_uniq" ON "catalog_packages" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE INDEX "catalog_pkg_agency_idx" ON "catalog_packages" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "catalog_tpr_agency_idx" ON "catalog_transfer_pricing" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_tpr_pair_uniq" ON "catalog_transfer_pricing" USING btree ("agency_id","from_zone_id","to_zone_id","vehicle_type");--> statement-breakpoint
CREATE INDEX "catalog_zones_agency_idx" ON "catalog_transfer_zones" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_veh_plate_uniq" ON "catalog_vehicles" USING btree ("agency_id","plate");--> statement-breakpoint
CREATE INDEX "catalog_veh_agency_idx" ON "catalog_vehicles" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "customers_agency_idx" ON "customers" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customers_civic_idx" ON "customers" USING btree ("civic_id");--> statement-breakpoint
CREATE INDEX "exchange_rates_agency_idx" ON "exchange_rates" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "exchange_rates_pair_idx" ON "exchange_rates" USING btree ("from_code","to_code","valid_from");--> statement-breakpoint
CREATE INDEX "payments_agency_idx" ON "payments" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "payments_reservation_idx" ON "payments" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "payments_psp_order_idx" ON "payments" USING btree ("psp_order_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "psp_webhooks_psp_idx" ON "psp_webhooks" USING btree ("psp","created_at");--> statement-breakpoint
CREATE INDEX "res_activity_agency_idx" ON "reservation_activity" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "res_activity_session_idx" ON "reservation_activity" USING btree ("session_id","session_date");--> statement-breakpoint
CREATE INDEX "res_flight_agency_idx" ON "reservation_flight" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "res_hotel_agency_idx" ON "reservation_hotel" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "res_hotel_provider_idx" ON "reservation_hotel" USING btree ("provider_booking_id");--> statement-breakpoint
CREATE INDEX "res_omra_agency_idx" ON "reservation_omra" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "res_pkg_agency_idx" ON "reservation_package" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "res_pkg_package_idx" ON "reservation_package" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "res_pkg_departure_idx" ON "reservation_package" USING btree ("departure_id");--> statement-breakpoint
CREATE INDEX "res_transfer_agency_idx" ON "reservation_transfer" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "res_transfer_flight_idx" ON "reservation_transfer" USING btree ("flight_number","flight_arrival_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_public_ref_uniq" ON "reservations" USING btree ("agency_id","public_ref");--> statement-breakpoint
CREATE INDEX "reservations_agency_idx" ON "reservations" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "reservations_module_idx" ON "reservations" USING btree ("agency_id","module");--> statement-breakpoint
CREATE INDEX "reservations_customer_idx" ON "reservations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "reservations_status_idx" ON "reservations" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "reservations_created_idx" ON "reservations" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "users_agency_idx" ON "users" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uniq" ON "users" USING btree ("email");