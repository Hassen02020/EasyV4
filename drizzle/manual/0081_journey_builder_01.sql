-- JOURNEY-BUILDER-01 — composition B2B multi-produits au-dessus des
-- moteurs de réservation existants (aucun nouveau booking/pricing/
-- financial engine). Additif pur : 2 nouveaux enums, 2 nouvelles tables.
-- Aucune table existante n'est modifiée.
--
-- `journey_lines.module` réutilise l'enum `reservation_module` existant
-- (jamais un second enum de modules) — aucune nouvelle valeur requise,
-- toutes les valeurs utilisées en V1 (hotel/package/omra/activity/
-- transfer/car/network) existent déjà.

CREATE TYPE journey_status AS ENUM (
  'draft',
  'ready',
  'processing',
  'confirmed',
  'partially_confirmed',
  'failed'
);

CREATE TYPE journey_line_status AS ENUM (
  'pending',
  'processing',
  'confirmed',
  'failed'
);

CREATE TABLE IF NOT EXISTS journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL,
  title text,
  status journey_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journeys_agency_idx ON journeys (agency_id);
CREATE INDEX IF NOT EXISTS journeys_customer_idx ON journeys (customer_id);

CREATE TABLE IF NOT EXISTS journey_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  module reservation_module NOT NULL,
  status journey_line_status NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL,
  price_tnd numeric(14, 2),
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  error_message text,
  confirmation_idempotency_key varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journey_lines_journey_idx ON journey_lines (journey_id);
CREATE INDEX IF NOT EXISTS journey_lines_reservation_idx ON journey_lines (reservation_id);
CREATE UNIQUE INDEX IF NOT EXISTS journey_lines_idempotency_uniq
  ON journey_lines (confirmation_idempotency_key)
  WHERE confirmation_idempotency_key IS NOT NULL;
