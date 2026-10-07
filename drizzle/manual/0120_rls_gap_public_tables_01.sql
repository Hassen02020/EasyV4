-- Migration 0120 — RLS-GAP-PUBLIC-TABLES-01 (2026-10-06)
--
-- get_advisors (security, ERROR) : 3 tables exposées PostgREST avaient RLS
-- entièrement désactivée ET des grants anon/authenticated (SELECT/INSERT/
-- UPDATE/DELETE) — origine : défaut de schéma Supabase, jamais demandé par
-- aucune migration de ce repo (voir audit d'impact, docs/ROADMAP.md).
-- Confirmé par audit : aucun chemin applicatif n'utilise anon/authenticated
-- sur ces 3 tables — seul app_runtime (Server Actions) les lit/écrit.
--
--  - canonical_hotels / canonical_hotel_supplier_mappings (0109) :
--    identité produit partagée, non partitionnée par agence — décision
--    déjà actée dans 0109 ("pas de RLS : identité partagée"). Ce chantier
--    ne réintroduit AUCUN tenant scoping : policy USING true / WITH CHECK
--    true pour app_runtime, fermeture du seul vrai trou (anon/authenticated).
--  - development_project_waitlist (0096) : liste d'attente globale
--    (emails), même raisonnement — pas d'agencyId, pas de tenant.
--
-- Grants app_runtime INCHANGÉS (vérifiés avant/après dans l'audit) :
--   canonical_hotels                  : SELECT, INSERT, UPDATE
--   canonical_hotel_supplier_mappings : SELECT, INSERT
--   development_project_waitlist      : SELECT, INSERT, UPDATE, DELETE
-- Seul anon/authenticated perdent tout accès.

BEGIN;

ALTER TABLE canonical_hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_hotels FORCE ROW LEVEL SECURITY;

CREATE POLICY canonical_hotels_app_runtime ON canonical_hotels
  FOR ALL
  TO app_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON canonical_hotels FROM anon, authenticated;

ALTER TABLE canonical_hotel_supplier_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_hotel_supplier_mappings FORCE ROW LEVEL SECURITY;

CREATE POLICY canonical_hotel_supplier_mappings_app_runtime
  ON canonical_hotel_supplier_mappings
  FOR ALL
  TO app_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON canonical_hotel_supplier_mappings FROM anon, authenticated;

ALTER TABLE development_project_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE development_project_waitlist FORCE ROW LEVEL SECURITY;

CREATE POLICY development_project_waitlist_app_runtime
  ON development_project_waitlist
  FOR ALL
  TO app_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON development_project_waitlist FROM anon, authenticated;

COMMIT;

-- Retour arrière :
--   DROP POLICY canonical_hotels_app_runtime ON canonical_hotels;
--   ALTER TABLE canonical_hotels DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON canonical_hotels TO anon, authenticated;
--   DROP POLICY canonical_hotel_supplier_mappings_app_runtime ON canonical_hotel_supplier_mappings;
--   ALTER TABLE canonical_hotel_supplier_mappings DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON canonical_hotel_supplier_mappings TO anon, authenticated;
--   DROP POLICY development_project_waitlist_app_runtime ON development_project_waitlist;
--   ALTER TABLE development_project_waitlist DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON development_project_waitlist TO anon, authenticated;
