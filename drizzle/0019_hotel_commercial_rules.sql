-- COMMERCIAL-HOTELS-01 : moteur de règles commerciales DB-driven pour hôtels
--
-- Miroir de `flight_commercial_rules` — même structure de priorité en cascade,
-- productScope adapté aux hôtels : { destination?, provider?, stars?, board_basis? }
--
-- Règles d'application identiques au moteur vols :
--   - agencyId NULL  = règle globale (s'applique à toutes les agences)
--   - channel NULL   = règle tous canaux (B2C / B2B / PARTNER / WHITE_LABEL)
--   - priorité DESC  = la règle la plus haute l'emporte
--   - fallback       = pricing_margins (comportement existant préservé)

CREATE TABLE IF NOT EXISTS "hotel_commercial_rules" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agency_id"     uuid,
  "channel"       varchar(16),
  "priority"      integer NOT NULL DEFAULT 50,
  "product_scope" jsonb,
  "fixed_fee"     numeric(12, 3) NOT NULL DEFAULT 0,
  "markup_rate"   numeric(8, 5)  NOT NULL DEFAULT 0,
  "min_markup"    numeric(12, 3),
  "max_markup"    numeric(12, 3),
  "currency"      varchar(3) NOT NULL DEFAULT 'TND',
  "is_active"     boolean NOT NULL DEFAULT true,
  "valid_from"    timestamptz,
  "valid_to"      timestamptz,
  "notes"         text,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);

-- FK vers agencies (même pattern que hotel_supplier_accounts — pas de référence
-- Drizzle cross-schema pour éviter le cycle d'import, FK SQL posée ici)
ALTER TABLE "hotel_commercial_rules"
  ADD CONSTRAINT "hotel_commercial_rules_agency_id_fkey"
  FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "hotel_commercial_rules_priority_idx"
  ON "hotel_commercial_rules" ("priority");

CREATE INDEX IF NOT EXISTS "hotel_commercial_rules_agency_channel_idx"
  ON "hotel_commercial_rules" ("agency_id", "channel");

CREATE INDEX IF NOT EXISTS "hotel_commercial_rules_active_idx"
  ON "hotel_commercial_rules" ("is_active");
