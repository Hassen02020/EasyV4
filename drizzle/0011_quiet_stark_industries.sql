CREATE TYPE "public"."authorized_product_type" AS ENUM('package', 'omra', 'activity', 'network', 'car', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."commercial_agreement_channel" AS ENUM('b2c', 'b2b', 'network', 'white_label', 'api');--> statement-breakpoint
CREATE TYPE "public"."commercial_agreement_easy2book_role" AS ENUM('platform', 'distributor', 'seller', 'owner');--> statement-breakpoint
CREATE TYPE "public"."commercial_agreement_status" AS ENUM('draft', 'active', 'suspended', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."destination_type" AS ENUM('country', 'city');--> statement-breakpoint
CREATE TYPE "public"."development_project_confidence" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."economic_entitlement_role" AS ENUM('seller', 'product_owner', 'supplier', 'partner', 'easy2book', 'tax_authority', 'discount');--> statement-breakpoint
CREATE TYPE "public"."economic_entitlement_status" AS ENUM('pending', 'earned', 'settleable', 'settled', 'compensated');--> statement-breakpoint
CREATE TYPE "public"."flight_booking_mode" AS ENUM('OFFLINE', 'API', 'AUTOMATIC');--> statement-breakpoint
CREATE TYPE "public"."flight_booking_status" AS ENUM('PENDING', 'PRICE_RECHECK', 'PRICE_CHANGED', 'APPROVED', 'BOOKING_IN_PROGRESS', 'BOOKED', 'TICKETING_IN_PROGRESS', 'CONFIRMED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."flight_display_mode" AS ENUM('SITE', 'API');--> statement-breakpoint
CREATE TYPE "public"."flight_fulfillment_mode" AS ENUM('api_direct', 'b2b_offline');--> statement-breakpoint
CREATE TYPE "public"."flight_recheck_status" AS ENUM('AVAILABLE', 'PRICE_CHANGED', 'UNAVAILABLE', 'EXPIRED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."flight_snapshot_status" AS ENUM('ACTIVE', 'USED', 'EXPIRED', 'INVALIDATED');--> statement-breakpoint
CREATE TYPE "public"."flight_supplier_name" AS ENUM('virtual', 'amadeus', 'travelport', 'sabre', 'duffel');--> statement-breakpoint
CREATE TYPE "public"."flight_ticket_status" AS ENUM('NOT_ISSUED', 'ISSUING', 'ISSUED', 'FAILED', 'VOIDED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."flight_trip_type" AS ENUM('ONE_WAY', 'ROUND_TRIP', 'MULTI_CITY');--> statement-breakpoint
CREATE TYPE "public"."hotel_supplier_account_status" AS ENUM('active', 'disabled', 'invalid_credentials', 'not_configured', 'error');--> statement-breakpoint
CREATE TYPE "public"."hotel_supplier_doc_status" AS ENUM('documented', 'documentation_required');--> statement-breakpoint
CREATE TYPE "public"."hotel_supplier_owner_type" AS ENUM('master', 'agency', 'whitelabel');--> statement-breakpoint
CREATE TYPE "public"."journey_line_status" AS ENUM('pending', 'processing', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."journey_status" AS ENUM('draft', 'ready', 'processing', 'confirmed', 'partially_confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."market_signal_confidence" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."mutuelle_catalog_product_type" AS ENUM('package', 'activity', 'omra');--> statement-breakpoint
CREATE TYPE "public"."mutuelle_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."supplier_certification_status" AS ENUM('registered', 'verified', 'connected', 'certified', 'premium_partner');--> statement-breakpoint
CREATE TYPE "public"."supplier_connectivity_level" AS ENUM('l0_manual', 'l1_portal', 'l2_file', 'l3_api', 'l4_xml_gds', 'l5_native');--> statement-breakpoint
CREATE TYPE "public"."supplier_onboarding_status" AS ENUM('invited', 'onboarding', 'pending_review', 'active', 'suspended', 'offboarded');--> statement-breakpoint
CREATE TYPE "public"."supplier_portal_user_role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
ALTER TYPE "public"."payment_psp" ADD VALUE 'virtual';--> statement-breakpoint
ALTER TYPE "public"."payment_psp" ADD VALUE 'paymee';--> statement-breakpoint
ALTER TYPE "public"."reservation_module" ADD VALUE 'hotel_monde';--> statement-breakpoint
ALTER TYPE "public"."reservation_module" ADD VALUE 'network';--> statement-breakpoint
ALTER TYPE "public"."reservation_source" ADD VALUE 'travelport' BEFORE 'expedia';--> statement-breakpoint
ALTER TYPE "public"."reservation_status" ADD VALUE 'expired';--> statement-breakpoint
ALTER TYPE "public"."reservation_transition" ADD VALUE 'expire';--> statement-breakpoint
ALTER TYPE "public"."reservation_transition" ADD VALUE 'await_provider';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'mutuelle_director';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'mutuelle_member';--> statement-breakpoint
CREATE TABLE "campaign_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"attributed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"lead_ids" jsonb NOT NULL,
	"consent_status_at_snapshot" boolean NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"objective" text,
	"channel" varchar(32) NOT NULL,
	"message" text,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"promo_ref" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_status_check" CHECK ("campaigns"."status" in ('draft','active','completed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "cancellation_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"product_type" "authorized_product_type" NOT NULL,
	"product_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"cancellable" boolean NOT NULL,
	"modifiable" boolean NOT NULL,
	"deadline_hours" integer,
	"cancellation_fee_percent" numeric(5, 2),
	"refund_allowed" boolean NOT NULL,
	"credit_allowed" boolean NOT NULL,
	"non_refundable" boolean DEFAULT false NOT NULL,
	"requires_validated_document" boolean DEFAULT false NOT NULL,
	"post_deadline_description" text,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_hotel_supplier_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_hotel_id" uuid NOT NULL,
	"supplier" varchar(32) NOT NULL,
	"supplier_hotel_code" varchar(128) NOT NULL,
	"match_confidence" varchar(16) NOT NULL,
	"match_reasons" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_hotels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"city" varchar(128),
	"country" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_party_type" varchar(30) NOT NULL,
	"seller_party_id" uuid NOT NULL,
	"owner_party_type" varchar(30),
	"owner_party_id" uuid,
	"supplier_party_type" varchar(30),
	"supplier_party_id" uuid,
	"easy2book_role" "commercial_agreement_easy2book_role" NOT NULL,
	"channel" "commercial_agreement_channel" NOT NULL,
	"currency" varchar(3) DEFAULT 'TND' NOT NULL,
	"payer_role" text DEFAULT 'customer' NOT NULL,
	"collector_party_type" varchar(30),
	"collector_party_id" uuid,
	"status" "commercial_agreement_status" DEFAULT 'draft' NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_settlement_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_ledger_id" uuid NOT NULL,
	"settlement_id" uuid NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ledger_entry_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"notes" text,
	"settled_by" uuid,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"channel" varchar(32) NOT NULL,
	"contact_ref" varchar(320) NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"contact_phone" varchar(32),
	"contact_external_id" varchar(128),
	"contact_name" varchar(200),
	"lead_id" uuid,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"last_message_preview" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" varchar(8) NOT NULL,
	"body" text,
	"handled_by_user_id" uuid,
	"external_message_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"lead_id" uuid,
	"assignee_id" uuid,
	"created_by" uuid,
	"type" varchar(32) DEFAULT 'followup' NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"title" varchar(255) NOT NULL,
	"notes" text,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"item_type" varchar(16) NOT NULL,
	"item_ref" varchar(128) NOT NULL,
	"title" varchar(255) NOT NULL,
	"image_url" text,
	"location" varchar(255),
	"price_from" numeric(12, 2),
	"currency" varchar(3),
	"href" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_topup_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_reference" text,
	"psp" text,
	"paymee_token" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "customer_topup_requests_payment_reference_unique" UNIQUE("payment_reference"),
	CONSTRAINT "customer_topup_requests_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "destination_external_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination_id" uuid NOT NULL,
	"module" varchar(32) NOT NULL,
	"external_id" varchar(64) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "destination_type" NOT NULL,
	"parent_id" uuid,
	"slug" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"name_en" varchar(120),
	"name_ar" varchar(120),
	"country_code" varchar(2),
	"region" varchar(100),
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"cover_media_url" text,
	"seo_description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destinations_city_has_parent_check" CHECK (("destinations"."type" = 'country' and "destinations"."parent_id" is null) or ("destinations"."type" = 'city' and "destinations"."parent_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "development_project_waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"email" text NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "development_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"confidence" "development_project_confidence" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"location" text,
	"project_type" text,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economic_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"party_type" varchar(30) NOT NULL,
	"party_id" uuid,
	"role" "economic_entitlement_role" NOT NULL,
	"qualification" varchar(30) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'TND' NOT NULL,
	"basis" text,
	"agreement_id" uuid,
	"rule_id" uuid,
	"status" "economic_entitlement_status" DEFAULT 'pending' NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"cancellation_treatment" varchar(20),
	"compensates_id" uuid,
	"settlement_status" varchar(20),
	"settlement_ref" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economic_entitlements_qualification_check" CHECK ("economic_entitlements"."qualification" in ('supplier_cost','seller_margin','owner_share','commission','platform_fee','distribution_fee','revenue_share','service_fee','tax','discount')),
	CONSTRAINT "economic_entitlements_cancellation_treatment_check" CHECK ("economic_entitlements"."cancellation_treatment" is null or "economic_entitlements"."cancellation_treatment" in ('full_reversal','pro_rata_fee','non_refundable'))
);
--> statement-breakpoint
CREATE TABLE "flight_ancillaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"ancillary_type" varchar(16) NOT NULL,
	"description" text,
	"amount" numeric(12, 3) NOT NULL,
	"currency" varchar(3) DEFAULT 'TND' NOT NULL,
	"segment_refs" jsonb,
	"passenger_ref" integer,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"provider_ancillary_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_booking_passengers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"passenger_type" varchar(3) DEFAULT 'ADT' NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"birth_date" date,
	"nationality" varchar(2),
	"passport_number" varchar(32),
	"passport_expiry" date,
	"sequence" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_booking_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"origin" varchar(8) NOT NULL,
	"destination" varchar(8) NOT NULL,
	"departure" timestamp with time zone NOT NULL,
	"arrival" timestamp with time zone NOT NULL,
	"airline" varchar(4) NOT NULL,
	"flight_number" varchar(16) NOT NULL,
	"duration_min" integer,
	"stops" integer DEFAULT 0 NOT NULL,
	"equipment" varchar(16),
	"cabin" varchar(16) DEFAULT 'ECONOMY' NOT NULL,
	"pnr" varchar(16)
);
--> statement-breakpoint
CREATE TABLE "flight_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"price_snapshot_id" uuid,
	"reservation_id" uuid,
	"customer_id" uuid,
	"order_id" uuid,
	"trip_type" "flight_trip_type" NOT NULL,
	"itinerary" jsonb NOT NULL,
	"contact" jsonb NOT NULL,
	"status" "flight_booking_status" DEFAULT 'PENDING' NOT NULL,
	"provider" varchar(32),
	"fulfillment_mode" "flight_fulfillment_mode",
	"supplier_booking_ref" varchar(64),
	"pnr" varchar(16),
	"last_recheck_status" "flight_recheck_status",
	"last_recheck_at" timestamp with time zone,
	"ops_notes" text,
	"sla_deadline" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_commercial_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid,
	"channel" varchar(16),
	"priority" integer DEFAULT 50 NOT NULL,
	"product_scope" jsonb,
	"fixed_fee" numeric(12, 3) DEFAULT '0' NOT NULL,
	"markup_rate" numeric(8, 5) DEFAULT '0' NOT NULL,
	"min_markup" numeric(12, 3),
	"max_markup" numeric(12, 3),
	"currency" varchar(3) DEFAULT 'TND' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"reservation_id" uuid,
	"customer_id" uuid,
	"trip_type" "flight_trip_type" NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"provider_order_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_price_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid,
	"agency_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_offer_id" varchar(128) NOT NULL,
	"itinerary" jsonb NOT NULL,
	"supplier_amount" numeric(12, 3) NOT NULL,
	"supplier_currency" varchar(3) DEFAULT 'TND' NOT NULL,
	"supplier_original_amount" numeric(12, 3),
	"supplier_original_currency" varchar(3),
	"fee" numeric(12, 3) DEFAULT '0' NOT NULL,
	"markup" numeric(12, 3) DEFAULT '0' NOT NULL,
	"selling_amount" numeric(12, 3) NOT NULL,
	"selling_currency" varchar(3) DEFAULT 'TND' NOT NULL,
	"baggage" jsonb,
	"fare_rules" jsonb,
	"status" "flight_snapshot_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"trip_type" "flight_trip_type" NOT NULL,
	"origin" varchar(8) NOT NULL,
	"destination" varchar(8) NOT NULL,
	"departure_date" date NOT NULL,
	"return_date" date,
	"segments" jsonb,
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"infants" integer DEFAULT 0 NOT NULL,
	"cabin" varchar(16) DEFAULT 'ECONOMY' NOT NULL,
	"currency" varchar(3) DEFAULT 'TND' NOT NULL,
	"provider" varchar(32),
	"search_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_supplier_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"supplier" "flight_supplier_name" NOT NULL,
	"display_mode" "flight_display_mode" DEFAULT 'API' NOT NULL,
	"display_url" text,
	"booking_mode" "flight_booking_mode" DEFAULT 'OFFLINE' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"api_enabled" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_supplier_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"ciphertext" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_supplier_credentials_config_id_unique" UNIQUE("config_id")
);
--> statement-breakpoint
CREATE TABLE "flight_supplier_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"snapshot_id" uuid,
	"provider" varchar(32) NOT NULL,
	"transaction_type" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"request" jsonb,
	"response" jsonb,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"passenger_id" uuid,
	"ticket_number" varchar(32),
	"status" "flight_ticket_status" DEFAULT 'NOT_ISSUED' NOT NULL,
	"coupon_status" jsonb,
	"issued_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"eticket_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"correction_mode" varchar(16) DEFAULT 'NONE' NOT NULL,
	"correction_value" numeric(10, 4) DEFAULT '0' NOT NULL,
	"bank_fee_mode" varchar(16) DEFAULT 'NONE' NOT NULL,
	"bank_fee_fixed" numeric(10, 2),
	"bank_fee_percent" numeric(6, 4),
	"bank_fee_min" numeric(10, 2),
	"bank_fee_max" numeric(10, 2),
	"bank_fee_currency" varchar(3) DEFAULT 'TND' NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_commercial_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid,
	"channel" varchar(16),
	"priority" integer DEFAULT 50 NOT NULL,
	"product_scope" jsonb,
	"fixed_fee" numeric(12, 3) DEFAULT '0' NOT NULL,
	"markup_rate" numeric(8, 5) DEFAULT '0' NOT NULL,
	"min_markup" numeric(12, 3),
	"max_markup" numeric(12, 3),
	"currency" varchar(3) DEFAULT 'TND' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_supplier_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"owner_type" "hotel_supplier_owner_type" NOT NULL,
	"agency_id" uuid NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"status" "hotel_supplier_account_status" DEFAULT 'not_configured' NOT NULL,
	"mode" varchar(16) DEFAULT 'live' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"timeout_ms" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_status" varchar(32),
	"last_test_error_code" varchar(64),
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_supplier_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"authorized_agency_id" uuid NOT NULL,
	"authorized_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_supplier_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"ciphertext" text NOT NULL,
	"key_version" integer NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(100) NOT NULL,
	"driver" varchar(32) NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"documentation_status" "hotel_supplier_doc_status" DEFAULT 'documentation_required' NOT NULL,
	"is_globally_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journey_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"module" "reservation_module" NOT NULL,
	"status" "journey_line_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"price_tnd" numeric(14, 2),
	"reservation_id" uuid,
	"error_message" text,
	"confirmation_idempotency_key" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"customer_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"title" text,
	"status" "journey_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"channel" varchar(32) NOT NULL,
	"contact_ref" varchar(320) NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"action" varchar(16) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" varchar(64) NOT NULL,
	"proof_ref" varchar(255),
	"recorded_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "lead_origin_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"role" varchar(24) NOT NULL,
	"actor_ref" varchar(255) NOT NULL,
	"source" varchar(64) NOT NULL,
	"notes" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_relance_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"threshold_days" integer DEFAULT 3 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_scoring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"signal" varchar(32) NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100),
	"email" varchar(320),
	"phone" varchar(32),
	"message" text,
	"product_type" varchar(16) DEFAULT 'general' NOT NULL,
	"product_ref" varchar(128),
	"product_label" varchar(255),
	"source_page" varchar(255) NOT NULL,
	"destination" varchar(128),
	"intention" varchar(16) DEFAULT 'standard' NOT NULL,
	"market" varchar(32) DEFAULT 'tunisia' NOT NULL,
	"origin_agency_id" uuid,
	"captured_by_user_id" uuid,
	"channel" varchar(32),
	"campaign_ref" varchar(255),
	"status" varchar(16) DEFAULT 'new' NOT NULL,
	"staff_notes" text,
	"handled_by_user_id" uuid,
	"reservation_id" uuid,
	"converted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"pending_points" integer DEFAULT 0 NOT NULL,
	"available_points" integer DEFAULT 0 NOT NULL,
	"lifetime_earned_points" integer DEFAULT 0 NOT NULL,
	"lifetime_redeemed_points" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"loyalty_account_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"bucket" varchar(16) NOT NULL,
	"points" integer NOT NULL,
	"balance_before" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reservation_id" uuid,
	"description" text NOT NULL,
	"metadata" jsonb,
	"idempotency_key" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"confidence" "market_signal_confidence" NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"category" text,
	"region" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mutuelle_catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"product_type" "mutuelle_catalog_product_type" NOT NULL,
	"product_id" uuid NOT NULL,
	"added_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mutuelle_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"execution_agency_id" uuid NOT NULL,
	"markup_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"convention_start_date" date,
	"convention_end_date" date,
	"contact_email" varchar(320),
	"contact_phone" varchar(32),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mutuelle_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"member_user_id" uuid NOT NULL,
	"module" "reservation_module" NOT NULL,
	"description" text NOT NULL,
	"travel_start_date" date NOT NULL,
	"travel_end_date" date NOT NULL,
	"pax_count" integer DEFAULT 1 NOT NULL,
	"status" "mutuelle_request_status" DEFAULT 'pending' NOT NULL,
	"director_note" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_idempotency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"action" varchar(64) NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"granted" boolean NOT NULL,
	"granted_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"product_type" "authorized_product_type" NOT NULL,
	"product_id" uuid NOT NULL,
	"channel" varchar(16) DEFAULT 'b2b' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"module" varchar(16) NOT NULL,
	"product_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"variants" jsonb NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"file_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"alt_text" varchar(255),
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"discount_type" varchar(16) NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"conditions" text,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"allow_below_cost" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promos_discount_type_check" CHECK ("promos"."discount_type" in ('percent','fixed'))
);
--> statement-breakpoint
CREATE TABLE "public_module_visuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"module_slug" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"hero_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"subtitle" varchar(300),
	"destination" varchar(120) NOT NULL,
	"module_slug" varchar(64) NOT NULL,
	"href" text NOT NULL,
	"image_url" text NOT NULL,
	"flag" varchar(16),
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_site_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"hero_image_url" text,
	"facebook_url" text,
	"instagram_url" text,
	"tiktok_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_network_product" (
	"reservation_id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_node_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"module" varchar(16) NOT NULL,
	"product_ref" varchar(128) NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"moderated_by_user_id" uuid,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_demand_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"product_type" varchar(32) NOT NULL,
	"destination" varchar(100) NOT NULL,
	"search_date" date NOT NULL,
	"search_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"slug" varchar(100) NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"short_description" text,
	"contact_name" varchar(200),
	"contact_email" varchar(320),
	"contact_phone" varchar(32),
	"contact_country" varchar(3),
	"modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"onboarding_status" "supplier_onboarding_status" DEFAULT 'invited' NOT NULL,
	"portal_enabled" boolean DEFAULT false NOT NULL,
	"logo_url" text,
	"internal_notes" text,
	"invited_by_user_id" uuid,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_portal_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_node_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "supplier_portal_user_role" DEFAULT 'staff' NOT NULL,
	"invited_email" varchar(320),
	"invitation_token" varchar(128),
	"invitation_token_expires_at" timestamp with time zone,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "inv_locks_redis_key_idx";--> statement-breakpoint
DROP INDEX "pricing_margins_agency_module_uniq";--> statement-breakpoint
DROP INDEX "partner_invoices_number_uniq";--> statement-breakpoint
ALTER TABLE "inventory_locks" ALTER COLUMN "redis_key" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "inventory_locks" ALTER COLUMN "item_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "omra_packages" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "psp_transaction_id" SET DATA TYPE varchar(128);--> statement-breakpoint
ALTER TABLE "wallet_accounts" ALTER COLUMN "agency_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "primary_color" varchar(7);--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "whatsapp_number" varchar(32);--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "facebook_url" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "instagram_url" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "tiktok_url" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "reservation_tolerance" numeric(12, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "domain" varchar(255);--> statement-breakpoint
ALTER TABLE "catalog_activities" ADD COLUMN "channels" text[] DEFAULT '{"b2c"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_activity_sessions" ADD COLUMN "booking_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_packages" ADD COLUMN "channels" text[] DEFAULT '{"b2c"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "margin_rules" ADD COLUMN "agreement_id" uuid;--> statement-breakpoint
ALTER TABLE "omra_packages" ADD COLUMN "channels" text[] DEFAULT '{"b2c"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_credit_movements" ADD COLUMN "amount_millimes" bigint;--> statement-breakpoint
ALTER TABLE "partner_credit_movements" ADD COLUMN "balance_after_millimes" bigint;--> statement-breakpoint
ALTER TABLE "partner_credit_movements" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "partner_invoices" ADD COLUMN "reservation_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "pricing_margins" ADD COLUMN "channel" varchar(16) DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "supplier_node_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cost_price" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cost_currency" varchar(3);--> statement-breakpoint
ALTER TABLE "reservation_financials" ADD COLUMN "applied_exchange_rate" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "reservation_financials" ADD COLUMN "applied_exchange_rate_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservation_financials" ADD COLUMN "fx_policy_id" uuid;--> statement-breakpoint
ALTER TABLE "reservation_financials" ADD COLUMN "cancellation_fee" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "reservation_financials" ADD COLUMN "refund_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "reservation_financials" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservation_financials" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "reservation_hotel" ADD COLUMN "provider_offer_id" varchar(128);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "fiscal_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "payment_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "guest_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "guest_access_token" text DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')) NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "connectivity_level" "supplier_connectivity_level" DEFAULT 'l0_manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "certification_status" "supplier_certification_status" DEFAULT 'registered' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mutuelle_group_id" uuid;--> statement-breakpoint
ALTER TABLE "wallet_accounts" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD COLUMN "amount_millimes" bigint;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD COLUMN "balance_before_millimes" bigint;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD COLUMN "balance_after_millimes" bigint;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD COLUMN "settlement_id" uuid;--> statement-breakpoint
ALTER TABLE "wallet_recharge_requests" ADD COLUMN "psp" varchar(32);--> statement-breakpoint
ALTER TABLE "campaign_attributions" ADD CONSTRAINT "campaign_attributions_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_attributions" ADD CONSTRAINT "campaign_attributions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_attributions" ADD CONSTRAINT "campaign_attributions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_attributions" ADD CONSTRAINT "campaign_attributions_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_targets" ADD CONSTRAINT "campaign_targets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_targets" ADD CONSTRAINT "campaign_targets_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_targets" ADD CONSTRAINT "campaign_targets_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_policies" ADD CONSTRAINT "cancellation_policies_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_hotel_supplier_mappings" ADD CONSTRAINT "canonical_hotel_supplier_mappings_canonical_hotel_id_canonical_hotels_id_fk" FOREIGN KEY ("canonical_hotel_id") REFERENCES "public"."canonical_hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_settlement_entries" ADD CONSTRAINT "commission_settlement_entries_wallet_ledger_id_wallet_ledger_id_fk" FOREIGN KEY ("wallet_ledger_id") REFERENCES "public"."wallet_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_settlement_entries" ADD CONSTRAINT "commission_settlement_entries_settlement_id_commission_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."commission_settlements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_conversations" ADD CONSTRAINT "crm_conversations_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_conversations" ADD CONSTRAINT "crm_conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_messages" ADD CONSTRAINT "crm_messages_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_messages" ADD CONSTRAINT "crm_messages_conversation_id_crm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."crm_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_topup_requests" ADD CONSTRAINT "customer_topup_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_topup_requests" ADD CONSTRAINT "customer_topup_requests_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_external_refs" ADD CONSTRAINT "destination_external_refs_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_parent_id_destinations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."destinations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "development_project_waitlist" ADD CONSTRAINT "development_project_waitlist_project_id_development_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."development_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_entitlements" ADD CONSTRAINT "economic_entitlements_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_entitlements" ADD CONSTRAINT "economic_entitlements_rule_id_margin_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."margin_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_entitlements" ADD CONSTRAINT "economic_entitlements_settlement_ref_commission_settlements_id_fk" FOREIGN KEY ("settlement_ref") REFERENCES "public"."commission_settlements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_ancillaries" ADD CONSTRAINT "flight_ancillaries_booking_id_flight_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."flight_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_booking_passengers" ADD CONSTRAINT "flight_booking_passengers_booking_id_flight_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."flight_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_booking_segments" ADD CONSTRAINT "flight_booking_segments_booking_id_flight_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."flight_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_bookings" ADD CONSTRAINT "flight_bookings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_bookings" ADD CONSTRAINT "flight_bookings_price_snapshot_id_flight_price_snapshots_id_fk" FOREIGN KEY ("price_snapshot_id") REFERENCES "public"."flight_price_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_bookings" ADD CONSTRAINT "flight_bookings_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_bookings" ADD CONSTRAINT "flight_bookings_order_id_flight_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."flight_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_commercial_rules" ADD CONSTRAINT "flight_commercial_rules_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_orders" ADD CONSTRAINT "flight_orders_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_orders" ADD CONSTRAINT "flight_orders_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_price_snapshots" ADD CONSTRAINT "flight_price_snapshots_search_id_flight_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."flight_searches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_price_snapshots" ADD CONSTRAINT "flight_price_snapshots_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_searches" ADD CONSTRAINT "flight_searches_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_supplier_transactions" ADD CONSTRAINT "flight_supplier_transactions_booking_id_flight_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."flight_bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_supplier_transactions" ADD CONSTRAINT "flight_supplier_transactions_snapshot_id_flight_price_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."flight_price_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_tickets" ADD CONSTRAINT "flight_tickets_booking_id_flight_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."flight_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_tickets" ADD CONSTRAINT "flight_tickets_passenger_id_flight_booking_passengers_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."flight_booking_passengers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_supplier_accounts" ADD CONSTRAINT "hotel_supplier_accounts_supplier_id_hotel_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."hotel_suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_supplier_authorizations" ADD CONSTRAINT "hotel_supplier_authorizations_account_id_hotel_supplier_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."hotel_supplier_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_supplier_credentials" ADD CONSTRAINT "hotel_supplier_credentials_account_id_hotel_supplier_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."hotel_supplier_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_lines" ADD CONSTRAINT "journey_lines_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_lines" ADD CONSTRAINT "journey_lines_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_consent_events" ADD CONSTRAINT "lead_consent_events_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_origin_events" ADD CONSTRAINT "lead_origin_events_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_origin_events" ADD CONSTRAINT "lead_origin_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_relance_settings" ADD CONSTRAINT "lead_relance_settings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_scoring_rules" ADD CONSTRAINT "lead_scoring_rules_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_origin_agency_id_agencies_id_fk" FOREIGN KEY ("origin_agency_id") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_captured_by_user_id_users_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_loyalty_account_id_loyalty_accounts_id_fk" FOREIGN KEY ("loyalty_account_id") REFERENCES "public"."loyalty_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutuelle_catalog_items" ADD CONSTRAINT "mutuelle_catalog_items_group_id_mutuelle_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."mutuelle_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutuelle_catalog_items" ADD CONSTRAINT "mutuelle_catalog_items_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutuelle_groups" ADD CONSTRAINT "mutuelle_groups_execution_agency_id_agencies_id_fk" FOREIGN KEY ("execution_agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutuelle_requests" ADD CONSTRAINT "mutuelle_requests_group_id_mutuelle_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."mutuelle_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutuelle_requests" ADD CONSTRAINT "mutuelle_requests_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutuelle_requests" ADD CONSTRAINT "mutuelle_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_idempotency" ADD CONSTRAINT "notification_idempotency_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_authorizations" ADD CONSTRAINT "product_authorizations_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_network_product" ADD CONSTRAINT "reservation_network_product_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_network_product" ADD CONSTRAINT "reservation_network_product_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_network_product" ADD CONSTRAINT "reservation_network_product_supplier_node_id_supplier_nodes_id_fk" FOREIGN KEY ("supplier_node_id") REFERENCES "public"."supplier_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_demand_signals" ADD CONSTRAINT "search_demand_signals_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_nodes" ADD CONSTRAINT "supplier_nodes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_portal_users" ADD CONSTRAINT "supplier_portal_users_supplier_node_id_supplier_nodes_id_fk" FOREIGN KEY ("supplier_node_id") REFERENCES "public"."supplier_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_attributions_reservation_uniq" ON "campaign_attributions" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "campaign_attributions_campaign_idx" ON "campaign_attributions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_attributions_agency_idx" ON "campaign_attributions" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_targets_campaign_contact_uniq" ON "campaign_targets" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "campaign_targets_agency_idx" ON "campaign_targets" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "campaign_targets_delivery_status_idx" ON "campaign_targets" USING btree ("campaign_id","delivery_status");--> statement-breakpoint
CREATE INDEX "campaigns_agency_status_idx" ON "campaigns" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "cancellation_policies_lookup_idx" ON "cancellation_policies" USING btree ("agency_id","product_type","product_id","is_active");--> statement-breakpoint
CREATE INDEX "cancellation_policies_agency_idx" ON "cancellation_policies" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_hotel_supplier_mappings_supplier_code_uniq" ON "canonical_hotel_supplier_mappings" USING btree ("supplier","supplier_hotel_code");--> statement-breakpoint
CREATE INDEX "canonical_hotel_supplier_mappings_canonical_idx" ON "canonical_hotel_supplier_mappings" USING btree ("canonical_hotel_id");--> statement-breakpoint
CREATE INDEX "commercial_agreements_seller_idx" ON "commercial_agreements" USING btree ("seller_party_type","seller_party_id");--> statement-breakpoint
CREATE INDEX "commercial_agreements_owner_idx" ON "commercial_agreements" USING btree ("owner_party_type","owner_party_id");--> statement-breakpoint
CREATE INDEX "commercial_agreements_supplier_idx" ON "commercial_agreements" USING btree ("supplier_party_type","supplier_party_id");--> statement-breakpoint
CREATE INDEX "commercial_agreements_collector_idx" ON "commercial_agreements" USING btree ("collector_party_type","collector_party_id");--> statement-breakpoint
CREATE INDEX "commercial_agreements_status_idx" ON "commercial_agreements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "commercial_agreements_channel_idx" ON "commercial_agreements" USING btree ("channel");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_settlement_entries_ledger_uniq" ON "commission_settlement_entries" USING btree ("wallet_ledger_id");--> statement-breakpoint
CREATE INDEX "commission_settlement_entries_settlement_idx" ON "commission_settlement_entries" USING btree ("settlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_settlements_period_uniq" ON "commission_settlements" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_resolution_uniq" ON "contacts" USING btree ("agency_id","channel","contact_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_conversations_agency_channel_phone_uniq" ON "crm_conversations" USING btree ("agency_id","channel","contact_phone") WHERE "crm_conversations"."contact_phone" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_conversations_agency_channel_external_uniq" ON "crm_conversations" USING btree ("agency_id","channel","contact_external_id") WHERE "crm_conversations"."contact_external_id" is not null;--> statement-breakpoint
CREATE INDEX "crm_conversations_agency_idx" ON "crm_conversations" USING btree ("agency_id","last_message_at");--> statement-breakpoint
CREATE INDEX "crm_conversations_lead_idx" ON "crm_conversations" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_messages_external_message_id_uniq" ON "crm_messages" USING btree ("external_message_id") WHERE "crm_messages"."external_message_id" is not null;--> statement-breakpoint
CREATE INDEX "crm_messages_conversation_idx" ON "crm_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_tasks_agency_status_idx" ON "crm_tasks" USING btree ("agency_id","status","due_at");--> statement-breakpoint
CREATE INDEX "crm_tasks_agency_assignee_idx" ON "crm_tasks" USING btree ("agency_id","assignee_id","status");--> statement-breakpoint
CREATE INDEX "crm_tasks_lead_idx" ON "crm_tasks" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_favorites_uniq" ON "customer_favorites" USING btree ("agency_id","auth_user_id","item_type","item_ref");--> statement-breakpoint
CREATE INDEX "customer_favorites_user_idx" ON "customer_favorites" USING btree ("auth_user_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_favorites_agency_idx" ON "customer_favorites" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "topup_req_agency_idx" ON "customer_topup_requests" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "topup_req_customer_idx" ON "customer_topup_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "topup_req_status_idx" ON "customer_topup_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "topup_req_payment_ref_idx" ON "customer_topup_requests" USING btree ("payment_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "destination_external_refs_module_external_uniq" ON "destination_external_refs" USING btree ("module","external_id");--> statement-breakpoint
CREATE INDEX "destination_external_refs_destination_idx" ON "destination_external_refs" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "destination_external_refs_module_idx" ON "destination_external_refs" USING btree ("module","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "destinations_slug_uniq" ON "destinations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "destinations_parent_idx" ON "destinations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "destinations_type_active_idx" ON "destinations" USING btree ("type","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "destinations_country_code_uniq" ON "destinations" USING btree ("country_code") WHERE "destinations"."type" = 'country';--> statement-breakpoint
CREATE INDEX "destinations_featured_idx" ON "destinations" USING btree ("display_order","name") WHERE "destinations"."is_featured" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "development_project_waitlist_project_email_uidx" ON "development_project_waitlist" USING btree ("project_id","email");--> statement-breakpoint
CREATE INDEX "development_project_waitlist_project_id_idx" ON "development_project_waitlist" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "development_projects_published_at_idx" ON "development_projects" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "development_projects_confidence_idx" ON "development_projects" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "development_projects_location_idx" ON "development_projects" USING btree ("location");--> statement-breakpoint
CREATE INDEX "economic_entitlements_reservation_idx" ON "economic_entitlements" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "economic_entitlements_party_idx" ON "economic_entitlements" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "economic_entitlements_status_idx" ON "economic_entitlements" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_entitlements_compensates_uniq" ON "economic_entitlements" USING btree ("compensates_id") WHERE "economic_entitlements"."compensates_id" is not null;--> statement-breakpoint
CREATE INDEX "flight_ancillaries_booking_idx" ON "flight_ancillaries" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "flight_ancillaries_type_idx" ON "flight_ancillaries" USING btree ("ancillary_type");--> statement-breakpoint
CREATE INDEX "flight_pax_booking_idx" ON "flight_booking_passengers" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "flight_seg_booking_idx" ON "flight_booking_segments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "flight_bookings_agency_idx" ON "flight_bookings" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "flight_bookings_status_idx" ON "flight_bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "flight_bookings_snapshot_idx" ON "flight_bookings" USING btree ("price_snapshot_id");--> statement-breakpoint
CREATE INDEX "flight_bookings_reservation_idx" ON "flight_bookings" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "flight_bookings_created_idx" ON "flight_bookings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "flight_commercial_rules_priority_idx" ON "flight_commercial_rules" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "flight_commercial_rules_agency_channel_idx" ON "flight_commercial_rules" USING btree ("agency_id","channel");--> statement-breakpoint
CREATE INDEX "flight_commercial_rules_active_idx" ON "flight_commercial_rules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "flight_orders_agency_idx" ON "flight_orders" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "flight_orders_reservation_idx" ON "flight_orders" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "flight_orders_status_idx" ON "flight_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "flight_snapshots_agency_idx" ON "flight_price_snapshots" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "flight_snapshots_status_idx" ON "flight_price_snapshots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "flight_snapshots_expires_idx" ON "flight_price_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "flight_searches_agency_idx" ON "flight_searches" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "flight_searches_created_idx" ON "flight_searches" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "flight_supplier_configs_agency_supplier_uniq" ON "flight_supplier_configs" USING btree ("agency_id","supplier");--> statement-breakpoint
CREATE INDEX "flight_supplier_configs_agency_idx" ON "flight_supplier_configs" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "flight_supplier_configs_active_idx" ON "flight_supplier_configs" USING btree ("active");--> statement-breakpoint
CREATE INDEX "flight_supplier_credentials_agency_idx" ON "flight_supplier_credentials" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "flight_tx_booking_idx" ON "flight_supplier_transactions" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "flight_tx_provider_idx" ON "flight_supplier_transactions" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "flight_tickets_booking_idx" ON "flight_tickets" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_policies_version_uniq" ON "fx_policies" USING btree ("version");--> statement-breakpoint
CREATE INDEX "fx_policies_effective_idx" ON "fx_policies" USING btree ("effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "hotel_commercial_rules_priority_idx" ON "hotel_commercial_rules" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "hotel_commercial_rules_agency_channel_idx" ON "hotel_commercial_rules" USING btree ("agency_id","channel");--> statement-breakpoint
CREATE INDEX "hotel_commercial_rules_active_idx" ON "hotel_commercial_rules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "hotel_supplier_accounts_agency_idx" ON "hotel_supplier_accounts" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "hotel_supplier_accounts_supplier_idx" ON "hotel_supplier_accounts" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "hotel_supplier_accounts_owner_type_idx" ON "hotel_supplier_accounts" USING btree ("owner_type");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_supplier_authorizations_account_agency_uniq" ON "hotel_supplier_authorizations" USING btree ("account_id","authorized_agency_id");--> statement-breakpoint
CREATE INDEX "hotel_supplier_authorizations_agency_idx" ON "hotel_supplier_authorizations" USING btree ("authorized_agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_supplier_credentials_account_uniq" ON "hotel_supplier_credentials" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "hotel_supplier_credentials_agency_idx" ON "hotel_supplier_credentials" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_suppliers_code_uniq" ON "hotel_suppliers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "journey_lines_journey_idx" ON "journey_lines" USING btree ("journey_id");--> statement-breakpoint
CREATE INDEX "journey_lines_reservation_idx" ON "journey_lines" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_lines_idempotency_uniq" ON "journey_lines" USING btree ("confirmation_idempotency_key") WHERE "journey_lines"."confirmation_idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "journeys_agency_idx" ON "journeys" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "journeys_customer_idx" ON "journeys" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "lead_consent_events_resolution_idx" ON "lead_consent_events" USING btree ("agency_id","channel","contact_ref","purpose","occurred_at");--> statement-breakpoint
CREATE INDEX "lead_origin_events_lead_idx" ON "lead_origin_events" USING btree ("lead_id","recorded_at");--> statement-breakpoint
CREATE INDEX "lead_origin_events_agency_idx" ON "lead_origin_events" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_relance_settings_agency_uniq" ON "lead_relance_settings" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "lead_scoring_rules_agency_idx" ON "lead_scoring_rules" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_scoring_rules_agency_signal_uniq" ON "lead_scoring_rules" USING btree ("agency_id","signal");--> statement-breakpoint
CREATE INDEX "leads_agency_status_idx" ON "leads" USING btree ("agency_id","status","created_at");--> statement-breakpoint
CREATE INDEX "leads_agency_idx" ON "leads" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_reservation_id_uniq" ON "leads" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "leads_agency_market_product_intention_idx" ON "leads" USING btree ("agency_id","market","product_type","intention");--> statement-breakpoint
CREATE INDEX "leads_agency_origin_channel_idx" ON "leads" USING btree ("agency_id","origin_agency_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_accounts_customer_uniq" ON "loyalty_accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "loyalty_accounts_agency_idx" ON "loyalty_accounts" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_ledger_idempotency_uniq" ON "loyalty_ledger" USING btree ("idempotency_key") WHERE "loyalty_ledger"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "loyalty_ledger_account_idx" ON "loyalty_ledger" USING btree ("loyalty_account_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_ledger_reservation_idx" ON "loyalty_ledger" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "loyalty_ledger_agency_idx" ON "loyalty_ledger" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "market_signals_published_at_idx" ON "market_signals" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "market_signals_confidence_idx" ON "market_signals" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "market_signals_region_idx" ON "market_signals" USING btree ("region");--> statement-breakpoint
CREATE UNIQUE INDEX "mutuelle_catalog_items_uniq" ON "mutuelle_catalog_items" USING btree ("group_id","product_type","product_id");--> statement-breakpoint
CREATE INDEX "mutuelle_catalog_items_group_idx" ON "mutuelle_catalog_items" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "mutuelle_catalog_items_product_idx" ON "mutuelle_catalog_items" USING btree ("product_type","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mutuelle_groups_slug_uniq" ON "mutuelle_groups" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "mutuelle_groups_execution_agency_idx" ON "mutuelle_groups" USING btree ("execution_agency_id");--> statement-breakpoint
CREATE INDEX "mutuelle_requests_group_idx" ON "mutuelle_requests" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "mutuelle_requests_member_idx" ON "mutuelle_requests" USING btree ("member_user_id");--> statement-breakpoint
CREATE INDEX "mutuelle_requests_status_idx" ON "mutuelle_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_idempotency_sent_uniq" ON "notification_idempotency" USING btree ("reservation_id","action");--> statement-breakpoint
CREATE INDEX "notification_idempotency_agency_idx" ON "notification_idempotency" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "notification_idempotency_reservation_idx" ON "notification_idempotency" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_user_permission_uniq" ON "permission_grants" USING btree ("agency_id","user_id","permission");--> statement-breakpoint
CREATE INDEX "permission_grants_agency_idx" ON "permission_grants" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "permission_grants_user_idx" ON "permission_grants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_auth_agency_product_uniq" ON "product_authorizations" USING btree ("agency_id","product_type","product_id");--> statement-breakpoint
CREATE INDEX "product_auth_product_idx" ON "product_authorizations" USING btree ("product_type","product_id");--> statement-breakpoint
CREATE INDEX "product_auth_agency_idx" ON "product_authorizations" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "product_media_agency_idx" ON "product_media" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "product_media_product_idx" ON "product_media" USING btree ("module","product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_media_one_cover_uniq" ON "product_media" USING btree ("module","product_id") WHERE "product_media"."is_cover" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "promos_campaign_uniq" ON "promos" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "promos_agency_idx" ON "promos" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "public_module_visuals_agency_module_uniq" ON "public_module_visuals" USING btree ("agency_id","module_slug");--> statement-breakpoint
CREATE INDEX "public_module_visuals_agency_enabled_idx" ON "public_module_visuals" USING btree ("agency_id","enabled","sort_order");--> statement-breakpoint
CREATE INDEX "public_promotions_agency_active_idx" ON "public_promotions" USING btree ("agency_id","enabled","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "public_site_settings_agency_uniq" ON "public_site_settings" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "res_network_product_product_idx" ON "reservation_network_product" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "res_network_product_supplier_node_idx" ON "reservation_network_product" USING btree ("supplier_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_reservation_id_uniq" ON "reviews" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "reviews_product_idx" ON "reviews" USING btree ("agency_id","module","product_ref","status");--> statement-breakpoint
CREATE INDEX "reviews_agency_status_idx" ON "reviews" USING btree ("agency_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "search_demand_signals_agg_uniq" ON "search_demand_signals" USING btree ("agency_id","product_type","destination","search_date");--> statement-breakpoint
CREATE INDEX "search_demand_signals_agency_date_idx" ON "search_demand_signals" USING btree ("agency_id","search_date");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_nodes_slug_uniq" ON "supplier_nodes" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_nodes_supplier_uniq" ON "supplier_nodes" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_nodes_onboarding_idx" ON "supplier_nodes" USING btree ("onboarding_status");--> statement-breakpoint
CREATE INDEX "supplier_nodes_portal_idx" ON "supplier_nodes" USING btree ("portal_enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_portal_users_node_user_uniq" ON "supplier_portal_users" USING btree ("supplier_node_id","user_id");--> statement-breakpoint
CREATE INDEX "supplier_portal_users_user_idx" ON "supplier_portal_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "supplier_portal_users_node_idx" ON "supplier_portal_users" USING btree ("supplier_node_id");--> statement-breakpoint
CREATE INDEX "supplier_portal_users_role_idx" ON "supplier_portal_users" USING btree ("role");--> statement-breakpoint
ALTER TABLE "partner_invoices" ADD CONSTRAINT "partner_invoices_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_node_id_supplier_nodes_id_fk" FOREIGN KEY ("supplier_node_id") REFERENCES "public"."supplier_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_mutuelle_group_id_mutuelle_groups_id_fk" FOREIGN KEY ("mutuelle_group_id") REFERENCES "public"."mutuelle_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_wallet_account_id_wallet_accounts_id_fk" FOREIGN KEY ("wallet_account_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agencies_domain_uniq" ON "agencies" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_notification_success_uniq" ON "audit_events" USING btree ("entity_type","entity_id","action") WHERE "audit_events"."action" in ('notification.whatsapp.sent', 'notification.crm.synced', 'notification.voucher_email.sent');--> statement-breakpoint
CREATE UNIQUE INDEX "inv_locks_redis_key_uniq" ON "inventory_locks" USING btree ("redis_key");--> statement-breakpoint
CREATE INDEX "partner_credit_reservation_idx" ON "partner_credit_movements" USING btree ("reservation_id") WHERE "partner_credit_movements"."reservation_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_credit_movements_idempotency_uniq" ON "partner_credit_movements" USING btree ("idempotency_key") WHERE "partner_credit_movements"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_invoices_reservation_uniq" ON "partner_invoices" USING btree ("reservation_id") WHERE "partner_invoices"."reservation_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_capture_idempotency_uniq" ON "payments" USING btree ("reservation_id","idempotency_key") WHERE "payments"."status" = 'captured' and "payments"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_margins_agency_module_channel_uniq" ON "pricing_margins" USING btree ("agency_id","module","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_guest_idempotency_uniq" ON "reservations" USING btree ("guest_idempotency_key") WHERE "reservations"."guest_idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_guest_access_token_uniq" ON "reservations" USING btree ("guest_access_token");--> statement-breakpoint
CREATE INDEX "users_mutuelle_group_idx" ON "users" USING btree ("mutuelle_group_id");--> statement-breakpoint
CREATE INDEX "wallet_accounts_customer_idx" ON "wallet_accounts" USING btree ("customer_id") WHERE "wallet_accounts"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_ledger_idempotency_uniq" ON "wallet_ledger" USING btree ("idempotency_key") WHERE "wallet_ledger"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_invoices_number_uniq" ON "partner_invoices" USING btree ("agency_id","invoice_number");--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_status_check" CHECK ("agencies"."status" in ('active','suspended'));--> statement-breakpoint
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_owner_check" CHECK (("wallet_accounts"."agency_id" is not null and "wallet_accounts"."customer_id" is null) or ("wallet_accounts"."agency_id" is null and "wallet_accounts"."customer_id" is not null) or ("wallet_accounts"."type" = 'commission' and "wallet_accounts"."agency_id" is null and "wallet_accounts"."customer_id" is null));--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_category_check" CHECK ("wallet_ledger"."category" is null or "wallet_ledger"."category" in ('booking','recharge','refund','commission','fee','adjustment'));