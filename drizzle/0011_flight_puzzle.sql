-- Flight Puzzle — Easy2Book
-- Full relational model: searches → offers → price_snapshots → bookings →
-- passengers / segments / tickets / supplier_transactions
-- Follows EasyV4 conventions: uuid PK, agency_id isolation, numeric(12,3) TND.

--> statement-breakpoint
CREATE TYPE "public"."flight_trip_type" AS ENUM('ONE_WAY', 'ROUND_TRIP', 'MULTI_CITY');

--> statement-breakpoint
CREATE TYPE "public"."flight_booking_status" AS ENUM(
  'PENDING',
  'PRICE_RECHECK',
  'PRICE_CHANGED',
  'APPROVED',
  'BOOKING_IN_PROGRESS',
  'BOOKED',
  'TICKETING_IN_PROGRESS',
  'CONFIRMED',
  'FAILED',
  'CANCELLED'
);

--> statement-breakpoint
CREATE TYPE "public"."flight_ticket_status" AS ENUM(
  'NOT_ISSUED',
  'ISSUING',
  'ISSUED',
  'FAILED',
  'VOIDED',
  'REFUNDED'
);

--> statement-breakpoint
CREATE TYPE "public"."flight_snapshot_status" AS ENUM(
  'ACTIVE',
  'USED',
  'EXPIRED',
  'INVALIDATED'
);

--> statement-breakpoint
CREATE TYPE "public"."flight_recheck_status" AS ENUM(
  'AVAILABLE',
  'PRICE_CHANGED',
  'UNAVAILABLE',
  'EXPIRED',
  'ERROR'
);

-- ── flight_searches ──────────────────────────────────────────────────────────
-- One row per search initiated by B2C / B2B / partner client.

--> statement-breakpoint
CREATE TABLE "flight_searches" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id"        uuid NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  "trip_type"        "flight_trip_type" NOT NULL,
  "origin"           varchar(8)  NOT NULL,
  "destination"      varchar(8)  NOT NULL,
  "departure_date"   date        NOT NULL,
  "return_date"      date,
  "segments"         jsonb,       -- MULTI_CITY legs [{origin, destination, date}]
  "adults"           integer     NOT NULL DEFAULT 1,
  "children"         integer     NOT NULL DEFAULT 0,
  "infants"          integer     NOT NULL DEFAULT 0,
  "cabin"            varchar(16) NOT NULL DEFAULT 'ECONOMY',
  "currency"         varchar(3)  NOT NULL DEFAULT 'TND',
  "provider"         varchar(32),  -- adapter name used (virtual / amadeus / ...)
  "search_id"        varchar(64),  -- adapter-side search correlation ID
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX "flight_searches_agency_idx" ON "flight_searches"("agency_id");
CREATE INDEX "flight_searches_created_idx" ON "flight_searches"("created_at");

-- ── flight_price_snapshots ────────────────────────────────────────────────────
-- Immutable snapshot of an offer as presented to the client.
-- The frontend NEVER stores or transmits a price — only a snapshot ID.

--> statement-breakpoint
CREATE TABLE "flight_price_snapshots" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "search_id"             uuid REFERENCES flight_searches(id) ON DELETE SET NULL,
  "agency_id"             uuid NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  "provider"              varchar(32) NOT NULL,
  "provider_offer_id"     varchar(128) NOT NULL,
  "itinerary"             jsonb NOT NULL,    -- CanonicalItinerary snapshot
  "supplier_amount"       numeric(12, 3)  NOT NULL,
  "supplier_currency"     varchar(3)      NOT NULL DEFAULT 'TND',
  "fee"                   numeric(12, 3)  NOT NULL DEFAULT 0,
  "markup"                numeric(12, 3)  NOT NULL DEFAULT 0,
  "selling_amount"        numeric(12, 3)  NOT NULL,
  "selling_currency"      varchar(3)      NOT NULL DEFAULT 'TND',
  "baggage"               jsonb,           -- CanonicalBaggage
  "fare_rules"            jsonb,           -- CanonicalFareRules
  "status"                "flight_snapshot_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at"            timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at"            timestamp with time zone NOT NULL
);

--> statement-breakpoint
CREATE INDEX "flight_snapshots_agency_idx"     ON "flight_price_snapshots"("agency_id");
CREATE INDEX "flight_snapshots_status_idx"     ON "flight_price_snapshots"("status");
CREATE INDEX "flight_snapshots_expires_idx"    ON "flight_price_snapshots"("expires_at");

-- ── flight_bookings ──────────────────────────────────────────────────────────
-- One booking request per customer demand (PENDING → ... → CONFIRMED).

--> statement-breakpoint
CREATE TABLE "flight_bookings" (
  "id"                        uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id"                 uuid NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  "price_snapshot_id"         uuid REFERENCES flight_price_snapshots(id) ON DELETE RESTRICT,
  "customer_id"               uuid,          -- ref to customers table (nullable for guest)
  "trip_type"                 "flight_trip_type" NOT NULL,
  "itinerary"                 jsonb NOT NULL, -- CanonicalItinerary at booking time
  "contact"                   jsonb NOT NULL, -- {email, phone, firstName, lastName}
  "status"                    "flight_booking_status" NOT NULL DEFAULT 'PENDING',
  "provider"                  varchar(32),
  "supplier_booking_ref"      varchar(64),    -- provider PNR or booking ref
  "pnr"                       varchar(16),
  "last_recheck_status"       "flight_recheck_status",
  "last_recheck_at"           timestamp with time zone,
  "ops_notes"                 text,           -- internal ticketing desk notes
  "sla_deadline"              timestamp with time zone,  -- ~15 min from PENDING
  "created_at"                timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"                timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX "flight_bookings_agency_idx"    ON "flight_bookings"("agency_id");
CREATE INDEX "flight_bookings_status_idx"    ON "flight_bookings"("status");
CREATE INDEX "flight_bookings_snapshot_idx" ON "flight_bookings"("price_snapshot_id");
CREATE INDEX "flight_bookings_created_idx"  ON "flight_bookings"("created_at");

-- ── flight_booking_passengers ─────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE "flight_booking_passengers" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id"       uuid NOT NULL REFERENCES flight_bookings(id) ON DELETE CASCADE,
  "passenger_type"   varchar(3)   NOT NULL DEFAULT 'ADT',  -- ADT / CHD / INF
  "first_name"       varchar(100) NOT NULL,
  "last_name"        varchar(100) NOT NULL,
  "birth_date"       date,
  "nationality"      varchar(2),   -- ISO-3166-1 alpha-2
  "passport_number"  varchar(32),
  "passport_expiry"  date,
  "sequence"         integer      NOT NULL DEFAULT 1
);

--> statement-breakpoint
CREATE INDEX "flight_pax_booking_idx" ON "flight_booking_passengers"("booking_id");

-- ── flight_booking_segments ───────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE "flight_booking_segments" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id"      uuid NOT NULL REFERENCES flight_bookings(id) ON DELETE CASCADE,
  "sequence"        integer      NOT NULL,
  "origin"          varchar(8)   NOT NULL,
  "destination"     varchar(8)   NOT NULL,
  "departure"       timestamp with time zone NOT NULL,
  "arrival"         timestamp with time zone NOT NULL,
  "airline"         varchar(4)   NOT NULL,
  "flight_number"   varchar(16)  NOT NULL,
  "duration_min"    integer,
  "stops"           integer      NOT NULL DEFAULT 0,
  "equipment"       varchar(16),
  "cabin"           varchar(16)  NOT NULL DEFAULT 'ECONOMY',
  "pnr"             varchar(16)  -- segment-level PNR if different from booking
);

--> statement-breakpoint
CREATE INDEX "flight_seg_booking_idx" ON "flight_booking_segments"("booking_id");

-- ── flight_tickets ────────────────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE "flight_tickets" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id"      uuid NOT NULL REFERENCES flight_bookings(id) ON DELETE CASCADE,
  "passenger_id"    uuid REFERENCES flight_booking_passengers(id) ON DELETE SET NULL,
  "ticket_number"   varchar(32),   -- IATA e-ticket: 3-digit airline + 10 digits
  "status"          "flight_ticket_status" NOT NULL DEFAULT 'NOT_ISSUED',
  "issued_at"       timestamp with time zone,
  "voided_at"       timestamp with time zone,
  "eticket_url"     text,
  "created_at"      timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX "flight_tickets_booking_idx" ON "flight_tickets"("booking_id");

-- ── flight_supplier_transactions ─────────────────────────────────────────────
-- Audit log: every request/response to a GDS adapter.

--> statement-breakpoint
CREATE TABLE "flight_supplier_transactions" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id"       uuid REFERENCES flight_bookings(id) ON DELETE SET NULL,
  "snapshot_id"      uuid REFERENCES flight_price_snapshots(id) ON DELETE SET NULL,
  "provider"         varchar(32)  NOT NULL,
  "transaction_type" varchar(32)  NOT NULL,  -- search / recheck / book / issue / cancel
  "status"           varchar(16)  NOT NULL,  -- success / error
  "request"          jsonb,
  "response"         jsonb,
  "duration_ms"      integer,
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX "flight_tx_booking_idx"  ON "flight_supplier_transactions"("booking_id");
CREATE INDEX "flight_tx_provider_idx" ON "flight_supplier_transactions"("provider");
