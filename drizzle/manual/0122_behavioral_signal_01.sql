-- Migration 0122 — BEHAVIORAL-SIGNAL-01 (2026-10-07)
--
-- Audit de conception dédié (docs/ROADMAP.md, BEHAVIORAL-INTENT-01/
-- BEHAVIORAL-SIGNAL-01) : signal de DEMANDE MARCHÉ agrégé (destination +
-- produit + jour), PAS un historique individuel. Décisions produit actées
-- avec l'utilisateur :
--  - AUCUN tracking individuel, aucune IP, aucun fingerprint, aucun
--    identifiant de visiteur — une recherche hôtel incrémente un COMPTEUR
--    partagé, jamais une ligne par recherche ;
--  - "pilote" strictement limité au produit hôtel ("hotel") — pas une
--    plateforme générique d'événements comportementaux ;
--  - jamais fusionné avec VIP Score ni NICHE.
--
-- Strictement additif : 1 nouvelle table, aucune colonne/table existante
-- touchée.
--
-- Leçon DEFAULT-PRIVILEGES-GAP-01 appliquée dès le départ : REVOKE DELETE
-- explicite (aucun besoin métier de supprimer une ligne de ce compteur
-- depuis l'application — la rétention, si besoin, sera une décision
-- séparée, pas un DELETE applicatif ad hoc).

BEGIN;

CREATE TABLE IF NOT EXISTS search_demand_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  product_type varchar(32) NOT NULL,
  destination varchar(100) NOT NULL,
  search_date date NOT NULL,
  search_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS search_demand_signals_agg_uniq
  ON search_demand_signals (agency_id, product_type, destination, search_date);

CREATE INDEX IF NOT EXISTS search_demand_signals_agency_date_idx
  ON search_demand_signals (agency_id, search_date);

ALTER TABLE search_demand_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_demand_signals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS search_demand_signals_tenant_isolation ON search_demand_signals;
CREATE POLICY search_demand_signals_tenant_isolation ON search_demand_signals
  FOR ALL
  USING  (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

GRANT SELECT, INSERT, UPDATE ON search_demand_signals TO app_runtime;
REVOKE DELETE ON search_demand_signals FROM app_runtime;

COMMIT;
