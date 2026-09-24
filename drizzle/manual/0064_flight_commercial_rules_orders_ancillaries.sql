-- ============================================================
-- 0064 — Flight Puzzle: Commercial Rules (G6), Orders (G5),
--         Ancillaries (G7), Coupon Status (G9)
--
-- All new tables; one new column on flight_bookings (order_id)
-- and one on flight_tickets (coupon_status). No existing
-- columns are modified — zero risk of data loss.
-- ============================================================

-- ── G6 — Commercial Rules ────────────────────────────────────
CREATE TABLE IF NOT EXISTS flight_commercial_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  channel           varchar(16) NOT NULL DEFAULT 'B2C',
  fixed_fee         numeric(12, 3) NOT NULL DEFAULT 0,
  markup_rate       numeric(8, 5) NOT NULL DEFAULT 0,
  currency          varchar(3) NOT NULL DEFAULT 'TND',
  is_active         boolean NOT NULL DEFAULT true,
  valid_from        timestamptz,
  valid_to          timestamptz,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flight_commercial_rules_agency_channel_idx
  ON flight_commercial_rules (agency_id, channel);

CREATE INDEX IF NOT EXISTS flight_commercial_rules_active_idx
  ON flight_commercial_rules (is_active);

-- ── G5 — Flight Orders ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS flight_orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id            uuid NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  reservation_id       uuid REFERENCES reservations(id) ON DELETE SET NULL,
  customer_id          uuid,
  trip_type            flight_trip_type NOT NULL,
  status               varchar(32) NOT NULL DEFAULT 'PENDING',
  provider_order_id    varchar(128),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flight_orders_agency_idx
  ON flight_orders (agency_id);

CREATE INDEX IF NOT EXISTS flight_orders_reservation_idx
  ON flight_orders (reservation_id);

CREATE INDEX IF NOT EXISTS flight_orders_status_idx
  ON flight_orders (status);

-- Add order_id FK to existing flight_bookings (nullable — backward compatible)
ALTER TABLE flight_bookings
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES flight_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS flight_bookings_order_idx
  ON flight_bookings (order_id);

-- ── G7 — Ancillaries ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flight_ancillaries (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              uuid NOT NULL REFERENCES flight_bookings(id) ON DELETE CASCADE,
  ancillary_type          varchar(16) NOT NULL,
  description             text,
  amount                  numeric(12, 3) NOT NULL,
  currency                varchar(3) NOT NULL DEFAULT 'TND',
  segment_refs            jsonb,
  passenger_ref           integer,
  status                  varchar(16) NOT NULL DEFAULT 'PENDING',
  provider_ancillary_id   varchar(64),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flight_ancillaries_booking_idx
  ON flight_ancillaries (booking_id);

CREATE INDEX IF NOT EXISTS flight_ancillaries_type_idx
  ON flight_ancillaries (ancillary_type);

-- ── G9 — Coupon Status on tickets ────────────────────────────
-- JSONB array: [{segment: 1, couponStatus: "OPEN"|"USED"|"EXCH"|"RFND"}]
ALTER TABLE flight_tickets
  ADD COLUMN IF NOT EXISTS coupon_status jsonb;
