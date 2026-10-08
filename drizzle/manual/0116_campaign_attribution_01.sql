-- Migration 0116 — CAMPAIGN-ATTRIBUTION-01 (2026-10-06)
--
-- Lien STABLE ET TRAÇABLE entre une réservation (BOOKING) et la
-- campagne qui l'a générée — écrit UNE SEULE FOIS par un job CAMPAIGN
-- (cron), jamais recalculé à la lecture (voir commentaire de tête dans
-- lib/db/schema.ts). BOOKING n'est PAS modifié par cette migration :
-- aucune colonne ajoutée sur reservations/customers.
--
-- reservation_id UNIQUE : rend structurellement impossible une double
-- attribution (1 réservation = 1 crédit), pas seulement une convention
-- de code.
--
-- Leçon DEFAULT-PRIVILEGES-GAP-01 appliquée dès le départ : append-only
-- (une attribution ne se corrige jamais, elle reste ou elle n'existe
-- pas) → REVOKE UPDATE, DELETE explicite.

BEGIN;

CREATE TABLE IF NOT EXISTS campaign_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  attributed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_attributions_reservation_uniq
  ON campaign_attributions (reservation_id);

CREATE INDEX IF NOT EXISTS campaign_attributions_campaign_idx
  ON campaign_attributions (campaign_id);

CREATE INDEX IF NOT EXISTS campaign_attributions_agency_idx
  ON campaign_attributions (agency_id);

ALTER TABLE campaign_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_attributions_tenant_isolation ON campaign_attributions;
CREATE POLICY campaign_attributions_tenant_isolation ON campaign_attributions
  FOR ALL
  USING  (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

GRANT SELECT, INSERT ON campaign_attributions TO app_runtime;
REVOKE UPDATE, DELETE ON campaign_attributions FROM app_runtime;

COMMIT;
