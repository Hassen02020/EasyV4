CREATE TYPE "public"."omra_gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."omra_hotel_category" AS ENUM('economy', 'standard', 'comfort', 'luxury', 'premium');--> statement-breakpoint
CREATE TYPE "public"."omra_marital_status" AS ENUM('single', 'married', 'widowed', 'divorced');--> statement-breakpoint
CREATE TYPE "public"."omra_meal_plan" AS ENUM('room_only', 'breakfast', 'half_board', 'full_board', 'all_inclusive');--> statement-breakpoint
CREATE TYPE "public"."omra_package_type" AS ENUM('omra', 'hajj', 'ramadan', 'umrah_plus');--> statement-breakpoint
CREATE TYPE "public"."omra_room_type" AS ENUM('single', 'double', 'triple', 'quad', 'suite');--> statement-breakpoint
CREATE TYPE "public"."omra_visa_status" AS ENUM('not_required', 'pending', 'submitted', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "omra_allotments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"departure_date" date NOT NULL,
	"total_capacity" integer NOT NULL,
	"reserved_count" integer DEFAULT 0 NOT NULL,
	"confirmed_count" integer DEFAULT 0 NOT NULL,
	"blocked_count" integer DEFAULT 0 NOT NULL,
	"available_count" integer NOT NULL,
	"override_price" numeric(12, 3),
	"booking_deadline" date,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "omra_flights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"direction" varchar(16) NOT NULL,
	"airline" varchar(64) NOT NULL,
	"flight_number" varchar(16) NOT NULL,
	"departure_airport" varchar(4) NOT NULL,
	"arrival_airport" varchar(4) NOT NULL,
	"departure_date" date NOT NULL,
	"departure_time" varchar(8) NOT NULL,
	"arrival_date" date NOT NULL,
	"arrival_time" varchar(8) NOT NULL,
	"travel_class" varchar(16) DEFAULT 'economy' NOT NULL,
	"duration_minutes" integer,
	"stops" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "omra_hotels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"city" varchar(16) NOT NULL,
	"category" "omra_hotel_category" NOT NULL,
	"address" text,
	"distance_to_kaaba" integer,
	"distance_to_prophet_mosque" integer,
	"amenities" text[],
	"photo_urls" text[],
	"description" text,
	"rating" numeric(2, 1),
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"metadata" jsonb,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "omra_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"type" "omra_package_type" NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"duration_days" integer NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"base_price" numeric(12, 3) NOT NULL,
	"includes_visa" boolean DEFAULT true NOT NULL,
	"includes_flights" boolean DEFAULT true NOT NULL,
	"includes_hotels" boolean DEFAULT true NOT NULL,
	"includes_transfers" boolean DEFAULT true NOT NULL,
	"includes_ziarat" boolean DEFAULT true NOT NULL,
	"includes_guide" boolean DEFAULT false NOT NULL,
	"max_pilgrims" integer DEFAULT 45 NOT NULL,
	"min_pilgrims" integer DEFAULT 20 NOT NULL,
	"metadata" jsonb,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "omra_pilgrims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"first_name" varchar(64) NOT NULL,
	"last_name" varchar(64) NOT NULL,
	"first_name_ar" varchar(64),
	"last_name_ar" varchar(64),
	"birth_date" date NOT NULL,
	"birth_place" varchar(64),
	"nationality" varchar(2) NOT NULL,
	"gender" "omra_gender" NOT NULL,
	"marital_status" "omra_marital_status" NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(128),
	"address" text,
	"city" varchar(64),
	"postal_code" varchar(16),
	"country" varchar(2) NOT NULL,
	"passport_number" varchar(32) NOT NULL,
	"passport_issue_date" date NOT NULL,
	"passport_expiry_date" date NOT NULL,
	"passport_issuing_country" varchar(2) NOT NULL,
	"visa_status" "omra_visa_status" DEFAULT 'pending' NOT NULL,
	"visa_number" varchar(32),
	"visa_issue_date" date,
	"visa_expiry_date" date,
	"blood_type" varchar(4),
	"has_medical_conditions" boolean DEFAULT false NOT NULL,
	"medical_conditions" text,
	"requires_special_assistance" boolean DEFAULT false NOT NULL,
	"special_assistance_details" text,
	"emergency_contact_name" varchar(128),
	"emergency_contact_phone" varchar(20),
	"emergency_contact_relation" varchar(32),
	"room_id" uuid,
	"room_type" "omra_room_type",
	"photo_url" text,
	"passport_scan_url" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "omra_room_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"hotel_id" uuid NOT NULL,
	"room_type" "omra_room_type" NOT NULL,
	"room_number" varchar(16),
	"floor" varchar(8),
	"capacity" integer NOT NULL,
	"occupied_count" integer DEFAULT 0 NOT NULL,
	"meal_plan" "omra_meal_plan" DEFAULT 'half_board' NOT NULL,
	"check_in_date" date NOT NULL,
	"check_out_date" date NOT NULL,
	"price_per_night" numeric(12, 3) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "omra_allotments" ADD CONSTRAINT "omra_allotments_package_id_omra_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."omra_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omra_flights" ADD CONSTRAINT "omra_flights_package_id_omra_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."omra_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omra_packages" ADD CONSTRAINT "omra_packages_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omra_pilgrims" ADD CONSTRAINT "omra_pilgrims_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omra_room_allocations" ADD CONSTRAINT "omra_room_allocations_package_id_omra_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."omra_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omra_room_allocations" ADD CONSTRAINT "omra_room_allocations_hotel_id_omra_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."omra_hotels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "omra_allot_pkg_idx" ON "omra_allotments" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "omra_allot_date_idx" ON "omra_allotments" USING btree ("departure_date");--> statement-breakpoint
CREATE INDEX "omra_allot_status_idx" ON "omra_allotments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "omra_allot_pkg_date_idx" ON "omra_allotments" USING btree ("package_id","departure_date");--> statement-breakpoint
CREATE INDEX "omra_flight_res_idx" ON "omra_flights" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "omra_flight_pkg_idx" ON "omra_flights" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "omra_flight_dir_idx" ON "omra_flights" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "omra_flight_dates_idx" ON "omra_flights" USING btree ("departure_date");--> statement-breakpoint
CREATE INDEX "omra_hotel_city_idx" ON "omra_hotels" USING btree ("city");--> statement-breakpoint
CREATE INDEX "omra_hotel_category_idx" ON "omra_hotels" USING btree ("category");--> statement-breakpoint
CREATE INDEX "omra_hotel_status_idx" ON "omra_hotels" USING btree ("status");--> statement-breakpoint
CREATE INDEX "omra_pkg_agency_idx" ON "omra_packages" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "omra_pkg_type_idx" ON "omra_packages" USING btree ("type");--> statement-breakpoint
CREATE INDEX "omra_pkg_valid_idx" ON "omra_packages" USING btree ("valid_from","valid_until");--> statement-breakpoint
CREATE INDEX "omra_pkg_status_idx" ON "omra_packages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "omra_pilgrim_res_idx" ON "omra_pilgrims" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "omra_pilgrim_agency_idx" ON "omra_pilgrims" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "omra_pilgrim_passport_idx" ON "omra_pilgrims" USING btree ("passport_number");--> statement-breakpoint
CREATE INDEX "omra_pilgrim_visa_idx" ON "omra_pilgrims" USING btree ("visa_status");--> statement-breakpoint
CREATE INDEX "omra_pilgrim_room_idx" ON "omra_pilgrims" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "omra_room_res_idx" ON "omra_room_allocations" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "omra_room_pkg_idx" ON "omra_room_allocations" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "omra_room_hotel_idx" ON "omra_room_allocations" USING btree ("hotel_id");--> statement-breakpoint
CREATE INDEX "omra_room_dates_idx" ON "omra_room_allocations" USING btree ("check_in_date","check_out_date");