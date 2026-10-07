-- Migration 0112 — CONSENT-01 (2026-10-06)
--
-- Audit de conception dédié (docs/ROADMAP.md) : le consentement marketing
-- n'existe nulle part dans ce dépôt. Modèle retenu : journal append-only
-- par POINT DE CONTACT (agencyId, channel, contactRef, purpose) — jamais
-- par lead ni par une identité "personne" inventée (aucune des deux
-- n'a d'identité canonique dans ce codebase, voir audit).
--
-- Règle de résolution : dernier événement par occurredAt fait foi (voir
-- commentaire de tête dans lib/db/schema.ts — délibérément différent de
-- lead_origin_events, où "dernier gagne" serait dangereux).
--
-- Strictement additif : 1 nouvelle table, aucune colonne/table existante
-- touchée. Aucun backfill : les contacts existants sans événement
-- restent "non consentants" par défaut (hasMarketingConsentCore retourne
-- false en l'absence de tout événement — jamais une présomption
-- d'accord).
--
-- Leçon DEFAULT-PRIVILEGES-GAP-01 appliquée dès le départ : un ALTER
-- DEFAULT PRIVILEGES préexistant (rôle postgres, schéma public) accorde
-- automatiquement INSERT/SELECT/UPDATE/DELETE à app_runtime sur toute
-- nouvelle table — le REVOKE explicite ci-dessous n'est donc pas
-- optionnel, il est obligatoire pour que l'append-only soit réel et pas
-- seulement une convention de code.

BEGIN;

CREATE TABLE IF NOT EXISTS lead_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  channel varchar(32) NOT NULL,
  contact_ref varchar(320) NOT NULL,
  purpose varchar(32) NOT NULL,
  action varchar(16) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source varchar(64) NOT NULL,
  proof_ref varchar(255),
  recorded_by_user_id uuid
);

CREATE INDEX IF NOT EXISTS lead_consent_events_resolution_idx
  ON lead_consent_events (agency_id, channel, contact_ref, purpose, occurred_at);

ALTER TABLE lead_consent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_consent_events_tenant_isolation ON lead_consent_events;
CREATE POLICY lead_consent_events_tenant_isolation ON lead_consent_events
  FOR ALL
  USING  (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

GRANT SELECT, INSERT ON lead_consent_events TO app_runtime;
REVOKE UPDATE, DELETE ON lead_consent_events FROM app_runtime;

COMMIT;
