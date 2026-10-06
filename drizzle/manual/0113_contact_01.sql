-- Migration 0113 — CONTACT-01 (2026-10-06)
--
-- Audit de conception dédié (docs/ROADMAP.md) : registre de POINTS DE
-- CONTACT normalisés (agencyId, channel, contactRef) → id stable.
-- `customers` a été explicitement exclu comme fondation (pas d'index
-- unique email/phone, et lib/admin/customer-360-core.ts documente déjà
-- qu'un même lead peut correspondre à plusieurs customerId sans jamais
-- être fusionné). Ce registre ne résout PAS une identité "personne" —
-- il reconnaît seulement qu'une même valeur de contact réapparaît.
--
-- PAS append-only (contrairement à lead_consent_events) : last_seen_at
-- est mis à jour à chaque résolution du même point de contact — un
-- registre/dimension, pas un journal. GRANT UPDATE donc légitime ici
-- (upsert), contrairement à CONSENT-01.
--
-- Strictement additif : 1 nouvelle table, aucune colonne/table
-- existante touchée. Aucun backfill des leads/customers existants.
--
-- Leçon DEFAULT-PRIVILEGES-GAP-01 appliquée dès le départ : REVOKE
-- DELETE explicite (aucun besoin métier de supprimer une ligne de ce
-- registre depuis l'application).

BEGIN;

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  channel varchar(32) NOT NULL,
  contact_ref varchar(320) NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_resolution_uniq
  ON contacts (agency_id, channel, contact_ref);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_tenant_isolation ON contacts;
CREATE POLICY contacts_tenant_isolation ON contacts
  FOR ALL
  USING  (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

GRANT SELECT, INSERT, UPDATE ON contacts TO app_runtime;
REVOKE DELETE ON contacts FROM app_runtime;

COMMIT;
