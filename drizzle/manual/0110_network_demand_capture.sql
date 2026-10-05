-- Migration 0110 — NETWORK-DEMAND-CAPTURE-01 (2026-10-05)
--
-- Audit (2026-10-05, docs/ROADMAP.md) : le CRM ne pouvait rattacher aucune
-- demande à son origine commerciale réseau (agence apporteuse, partenaire,
-- commercial, canal, campagne) — `agencyId` sur `leads` est le TENANT
-- propriétaire, jamais l'apporteur. Modèle retenu après audit de
-- modélisation (hybride, validé) : un journal append-only
-- (lead_origin_events) comme source de vérité/audit, avec 4 colonnes
-- "résolues" sur `leads` comme cache rapide pour la segmentation
-- (CRM-NICHE-02) — rang de confiance maximal par rôle, jamais un simple
-- départage par date (voir LEAD_ORIGIN_SOURCE_TRUST,
-- lib/crm/network-demand-capture-core.ts).
--
-- Strictement additif : 4 colonnes nullable sur `leads`, 1 nouvelle table.
-- Aucune colonne existante touchée, aucun impact sur
-- reservations/payments/wallet. Pas de backfill : les leads existants
-- n'ont aucune origine fabriquée (nullable, jamais de valeur inventée).

BEGIN;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS origin_agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS captured_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel varchar(32),
  ADD COLUMN IF NOT EXISTS campaign_ref varchar(255);

CREATE INDEX IF NOT EXISTS leads_agency_origin_channel_idx
  ON leads (agency_id, origin_agency_id, channel);

CREATE TABLE IF NOT EXISTS lead_origin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  role varchar(24) NOT NULL,
  actor_ref varchar(255) NOT NULL,
  source varchar(64) NOT NULL,
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_origin_events_lead_idx
  ON lead_origin_events (lead_id, recorded_at);

CREATE INDEX IF NOT EXISTS lead_origin_events_agency_idx
  ON lead_origin_events (agency_id);

-- RLS — même pattern tenant-isolation que leads/notification_idempotency.
-- Pas de restriction "apporteur uniquement" (hors scope de ce chantier).
ALTER TABLE lead_origin_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_origin_events_tenant_isolation ON lead_origin_events;
CREATE POLICY lead_origin_events_tenant_isolation ON lead_origin_events
  FOR ALL
  USING  (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

GRANT SELECT, INSERT ON lead_origin_events TO app_runtime;

-- CRITIQUE — découvert en appliquant cette migration en production : un
-- ALTER DEFAULT PRIVILEGES préexistant (rôle postgres, schéma public,
-- voir 0069_database_url_app_runtime_cutover.sql) accorde automatiquement
-- INSERT/SELECT/UPDATE/DELETE à app_runtime sur TOUTE nouvelle table créée
-- dans public. Le GRANT ci-dessus (SELECT, INSERT seulement) ne retire
-- PAS ce qui a déjà été accordé par défaut — sans ce REVOKE explicite,
-- app_runtime aurait UPDATE/DELETE malgré ce fichier, et l'invariant
-- append-only ne serait vrai qu'en apparence (vérifié faux en production
-- avant ce correctif). Toujours REVOKE explicitement après CREATE TABLE
-- pour toute table censée être append-only dans ce dépôt.
REVOKE UPDATE, DELETE ON lead_origin_events FROM app_runtime;

COMMIT;
