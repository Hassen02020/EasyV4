-- Migration 0117 — PROMO-01 (2026-10-06)
--
-- Audit de conception dédié (docs/ROADMAP.md) : PROMO décide "quelle
-- offre", jamais "quel prix final" (PRICING) ni "quelle réservation"
-- (BOOKING) — aucune colonne prix/réservation sur cette table.
--
-- Décision explicite de l'utilisateur (2026-10-06) : pas de promo
-- générique indépendante — campaign_id obligatoire ET unique (1 promo
-- par campagne), cohérent avec campaigns.promo_ref (pointeur singulier
-- posé dès CAMPAIGN-PERSISTENCE-01, jamais rempli jusqu'ici).
--
-- Strictement additif : 1 nouvelle table, aucune colonne/table
-- existante modifiée (campaigns.promo_ref existe déjà).
--
-- Leçon DEFAULT-PRIVILEGES-GAP-01 appliquée dès le départ : REVOKE
-- DELETE (aucun besoin métier de supprimer une promo depuis
-- l'application — UPDATE reste nécessaire tant que la campagne est en
-- 'draft', gardé en code dans updatePromoCore, pas au niveau du grant).

BEGIN;

CREATE TABLE IF NOT EXISTS promos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  discount_type varchar(16) NOT NULL,
  discount_value decimal(10,2) NOT NULL,
  conditions text,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promos_discount_type_check
    CHECK (discount_type in ('percent','fixed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS promos_campaign_uniq
  ON promos (campaign_id);

CREATE INDEX IF NOT EXISTS promos_agency_idx
  ON promos (agency_id);

ALTER TABLE promos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promos_tenant_isolation ON promos;
CREATE POLICY promos_tenant_isolation ON promos
  FOR ALL
  USING  (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

GRANT SELECT, INSERT, UPDATE ON promos TO app_runtime;
REVOKE DELETE ON promos FROM app_runtime;

COMMIT;
