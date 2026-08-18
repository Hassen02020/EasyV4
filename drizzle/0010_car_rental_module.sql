CREATE TYPE "public"."car_fleet_status" AS ENUM('available', 'rented', 'maintenance', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."car_fuel_type" AS ENUM('petrol', 'diesel', 'hybrid', 'electric');--> statement-breakpoint
CREATE TYPE "public"."car_insurance_level" AS ENUM('basic', 'standard', 'premium', 'full');--> statement-breakpoint
CREATE TYPE "public"."car_transmission_type" AS ENUM('manual', 'automatic');--> statement-breakpoint
ALTER TYPE "public"."reservation_module" ADD VALUE 'car';--> statement-breakpoint
CREATE TABLE "car_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"date" date NOT NULL,
	"total_units" integer NOT NULL,
	"booked_units" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "car_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"example_models" text[],
	"seats" integer DEFAULT 5 NOT NULL,
	"doors" integer DEFAULT 4 NOT NULL,
	"luggage_capacity" integer DEFAULT 2 NOT NULL,
	"transmission" "car_transmission_type" DEFAULT 'manual' NOT NULL,
	"fuel_type" "car_fuel_type" DEFAULT 'petrol' NOT NULL,
	"air_conditioning" boolean DEFAULT true NOT NULL,
	"min_driver_age" integer DEFAULT 21 NOT NULL,
	"min_license_years" integer DEFAULT 1 NOT NULL,
	"image_urls" text[],
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "car_fleet_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"current_location_id" uuid,
	"plate" varchar(32) NOT NULL,
	"brand" varchar(64) NOT NULL,
	"model" varchar(64) NOT NULL,
	"year" integer,
	"color" varchar(32),
	"odometer_km" integer,
	"status" "car_fleet_status" DEFAULT 'available' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "car_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"location_type" varchar(16) DEFAULT 'city' NOT NULL,
	"address" text,
	"city" varchar(100) NOT NULL,
	"airport_code" varchar(3),
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"opening_hours" jsonb,
	"one_way_fee_tnd" numeric(10, 3),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "car_pricing_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"location_id" uuid,
	"daily_rate_tnd" numeric(10, 3) NOT NULL,
	"weekly_rate_tnd" numeric(10, 3),
	"min_rental_days" integer DEFAULT 1 NOT NULL,
	"extra_driver_fee_tnd" numeric(10, 3) DEFAULT '0',
	"deposit_tnd" numeric(10, 3) DEFAULT '0',
	"insurance_daily_fee_tnd" jsonb,
	"valid_from" date,
	"valid_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_car" (
	"reservation_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"pickup_location_id" uuid NOT NULL,
	"dropoff_location_id" uuid NOT NULL,
	"pickup_at" timestamp with time zone NOT NULL,
	"dropoff_at" timestamp with time zone NOT NULL,
	"rental_days" integer NOT NULL,
	"driver_full_name" varchar(200) NOT NULL,
	"driver_license_number" varchar(64) NOT NULL,
	"driver_license_country" varchar(64),
	"driver_birth_date" date,
	"extra_drivers" jsonb,
	"insurance_level" "car_insurance_level" DEFAULT 'basic' NOT NULL,
	"mileage_limit_km" integer,
	"deposit_amount_tnd" numeric(10, 3) DEFAULT '0',
	"provider_booking_id" varchar(64),
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "car_availability" ADD CONSTRAINT "car_availability_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_availability" ADD CONSTRAINT "car_availability_category_id_car_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."car_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_availability" ADD CONSTRAINT "car_availability_location_id_car_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."car_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_categories" ADD CONSTRAINT "car_categories_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_fleet_vehicles" ADD CONSTRAINT "car_fleet_vehicles_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_fleet_vehicles" ADD CONSTRAINT "car_fleet_vehicles_category_id_car_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."car_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_fleet_vehicles" ADD CONSTRAINT "car_fleet_vehicles_current_location_id_car_locations_id_fk" FOREIGN KEY ("current_location_id") REFERENCES "public"."car_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_locations" ADD CONSTRAINT "car_locations_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_pricing_rates" ADD CONSTRAINT "car_pricing_rates_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_pricing_rates" ADD CONSTRAINT "car_pricing_rates_category_id_car_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."car_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_pricing_rates" ADD CONSTRAINT "car_pricing_rates_location_id_car_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."car_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_car" ADD CONSTRAINT "reservation_car_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_car" ADD CONSTRAINT "reservation_car_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_car" ADD CONSTRAINT "reservation_car_category_id_car_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."car_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_car" ADD CONSTRAINT "reservation_car_vehicle_id_car_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."car_fleet_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_car" ADD CONSTRAINT "reservation_car_pickup_location_id_car_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."car_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_car" ADD CONSTRAINT "reservation_car_dropoff_location_id_car_locations_id_fk" FOREIGN KEY ("dropoff_location_id") REFERENCES "public"."car_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "car_avail_category_location_date_uniq" ON "car_availability" USING btree ("category_id","location_id","date");--> statement-breakpoint
CREATE INDEX "car_avail_agency_idx" ON "car_availability" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "car_avail_date_idx" ON "car_availability" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "car_categories_agency_code_uniq" ON "car_categories" USING btree ("agency_id","code");--> statement-breakpoint
CREATE INDEX "car_categories_agency_idx" ON "car_categories" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "car_categories_status_idx" ON "car_categories" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "car_fleet_agency_plate_uniq" ON "car_fleet_vehicles" USING btree ("agency_id","plate");--> statement-breakpoint
CREATE INDEX "car_fleet_agency_idx" ON "car_fleet_vehicles" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "car_fleet_category_idx" ON "car_fleet_vehicles" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "car_fleet_status_idx" ON "car_fleet_vehicles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "car_locations_agency_idx" ON "car_locations" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "car_locations_city_idx" ON "car_locations" USING btree ("city");--> statement-breakpoint
CREATE INDEX "car_rates_agency_idx" ON "car_pricing_rates" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "car_rates_category_idx" ON "car_pricing_rates" USING btree ("category_id","valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "car_rates_location_idx" ON "car_pricing_rates" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "res_car_agency_idx" ON "reservation_car" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "res_car_category_idx" ON "reservation_car" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "res_car_vehicle_idx" ON "reservation_car" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "res_car_pickup_idx" ON "reservation_car" USING btree ("pickup_location_id","pickup_at");