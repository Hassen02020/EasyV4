-- Migration 0114 — CAMPAIGN-PERSISTENCE-01 (2026-10-06)
--
-- Audit de conception dédié (docs/ROADMAP.md) : CAMPAIGN décide "à qui
-- et pour quelle action commerciale" — jamais "quelle offre" (PROMO),
-- "quel prix" (PRICING) ni "quelle réservation" (BOOKING). Aucune de
-- ces colonnes n'apparaît dans `campaigns`.
--
-- `campaign_targets` est un SNAPSHOT figé au moment du LANCEMENT
-- (transition de statut 'draft' → 'active'), PAS à la création : une
-- campagne se prépare un jour et se lance un autre, les contacts visés
-- doivent correspondre à l'audience au moment de l'action commerciale
-- réelle, jamais à un instant antérieur. Jamais un recalcul live après
-- coup : AUDIENCE (NICHE/SIGNAL/TREND) n'est pas persistée dans ce
-- dépôt, donc c'est ce snapshot, pris une seule fois au lancement, qui
-- permettra à CONVERSION/LEARNING de mesurer "qui a été visé" sans que
-- l'audience ne dérive après coup. Seuls les contacts ÉLIGIBLES
-- (CAMPAIGN-01, filterAudienceByConsentCore) sont enregistrés — un
-- contact exclu n'est jamais une ligne de cette table.
--
-- `contactId` référence CONTACT-01 (jamais une copie email/téléphone).
-- `consentStatusAtSnapshot` est une preuve horodatée ("vrai à cet
-- instant"), jamais relue comme source de vérité — CONSENT-01 reste
-- l'unique source de vérité pour l'état courant.
--
-- Strictement additif : 2 nouvelles tables, aucune colonne/table
-- existante touchée.
--
-- Leçon DEFAULT-PRIVILEGES-GAP-01 appliquée dès le départ : REVOKE
-- DELETE explicite sur les deux tables (aucun besoin métier de
-- supprimer une campagne ou une cible depuis l'application — seule une
-- transition de statut, via UPDATE, est légitime).

BEGIN;

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  objective text,
  channel varchar(32) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'draft',
  promo_ref uuid,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_status_check
    CHECK (status in ('draft','active','completed','cancelled'))
);

CREATE INDEX IF NOT EXISTS campaigns_agency_status_idx
  ON campaigns (agency_id, status);

CREATE TABLE IF NOT EXISTS campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id),
  lead_ids jsonb NOT NULL,
  consent_status_at_snapshot boolean NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_targets_campaign_contact_uniq
  ON campaign_targets (campaign_id, contact_id);

CREATE INDEX IF NOT EXISTS campaign_targets_agency_idx
  ON campaign_targets (agency_id);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_tenant_isolation ON campaigns;
CREATE POLICY campaigns_tenant_isolation ON campaigns
  FOR ALL
  USING  (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

DROP POLICY IF EXISTS campaign_targets_tenant_isolation ON campaign_targets;
CREATE POLICY campaign_targets_tenant_isolation ON campaign_targets
  FOR ALL
  USING  (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

GRANT SELECT, INSERT, UPDATE ON campaigns TO app_runtime;
REVOKE DELETE ON campaigns FROM app_runtime;

GRANT SELECT, INSERT ON campaign_targets TO app_runtime;
REVOKE UPDATE, DELETE ON campaign_targets FROM app_runtime;

COMMIT;
