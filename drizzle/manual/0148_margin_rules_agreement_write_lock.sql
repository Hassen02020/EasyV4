-- 0148 — MARGIN-RULES-AGREEMENT-RLS-01 : seule la plateforme (super_admin)
-- écrit les règles de marge rattachées à un accord commercial.
--
-- Décision Direction D-01a (docs/ECONOMIC_MODEL.md §10) : la part
-- d'Easy2Book est fixée par Easy2Book seul ; une agence ne peut jamais la
-- modifier. Depuis COMMERCIAL-AGREEMENT-WIRING-01 (PR #334), cette part est
-- lue dans `margin_rules` via `agreement_id` (lib/finance/agreement-fee.ts).
--
-- Avant : une seule policy `margin_rules_tenant_isolation` FOR ALL
-- (`agency_id = current_agency_id() OR is_super_admin()`, migration 0010) —
-- une agence pouvait créer, modifier, supprimer ses lignes, y compris une
-- ligne liée à un accord, ou rattacher une de ses lignes à un accord.
--
-- Après :
--   - SELECT inchangé (l'agence lit ses lignes : nécessaire au calcul de la
--     part Easy2Book sous son contexte, lib/finance/agreement-fee.ts).
--   - INSERT / UPDATE / DELETE : super_admin, OU l'agence sur SES lignes
--     sans accord (`agreement_id IS NULL`, avant ET après modification).
--     Une agence ne peut donc ni créer, ni modifier, ni supprimer une ligne
--     liée à un accord, ni rattacher (ou détacher) une ligne à un accord.
--   - Privilèges `anon` / `authenticated` révoqués (aucun code ne lit ni
--     n'écrit `margin_rules` par ces rôles ; même précédent que 0120) :
--     ferme la route PostgREST, et TRUNCATE, qui ignore la RLS.
--
-- Audit préalable production (lecture seule, 2026-11-06) : 0 ligne dans
-- margin_rules ; policy 0010 seule ; RLS activée et forcée ; anon et
-- authenticated disposaient de tous les privilèges, TRUNCATE compris ;
-- aucune fonction SECURITY DEFINER n'écrit margin_rules ; aucun code
-- applicatif n'écrit margin_rules (lecture seule : agreement-fee.ts,
-- margin-analytics-core.ts).
--
-- Idempotente. Aucune donnée modifiée.
--
-- Retour arrière :
--   BEGIN;
--   DROP POLICY IF EXISTS margin_rules_read ON margin_rules;
--   DROP POLICY IF EXISTS margin_rules_insert ON margin_rules;
--   DROP POLICY IF EXISTS margin_rules_update ON margin_rules;
--   DROP POLICY IF EXISTS margin_rules_delete ON margin_rules;
--   CREATE POLICY margin_rules_tenant_isolation ON margin_rules FOR ALL
--     USING (agency_id = current_agency_id() OR is_super_admin())
--     WITH CHECK (agency_id = current_agency_id() OR is_super_admin());
--   COMMIT;
--   (les privilèges anon/authenticated ne sont pas restaurés : aucun usage)

BEGIN;

ALTER TABLE margin_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS margin_rules_tenant_isolation ON margin_rules;
DROP POLICY IF EXISTS margin_rules_read ON margin_rules;
DROP POLICY IF EXISTS margin_rules_insert ON margin_rules;
DROP POLICY IF EXISTS margin_rules_update ON margin_rules;
DROP POLICY IF EXISTS margin_rules_delete ON margin_rules;

CREATE POLICY margin_rules_read ON margin_rules
  FOR SELECT
  USING (agency_id = current_agency_id() OR is_super_admin());

CREATE POLICY margin_rules_insert ON margin_rules
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (agency_id = current_agency_id() AND agreement_id IS NULL)
  );

CREATE POLICY margin_rules_update ON margin_rules
  FOR UPDATE
  USING (
    is_super_admin()
    OR (agency_id = current_agency_id() AND agreement_id IS NULL)
  )
  WITH CHECK (
    is_super_admin()
    OR (agency_id = current_agency_id() AND agreement_id IS NULL)
  );

CREATE POLICY margin_rules_delete ON margin_rules
  FOR DELETE
  USING (
    is_super_admin()
    OR (agency_id = current_agency_id() AND agreement_id IS NULL)
  );

REVOKE ALL ON margin_rules FROM anon;
REVOKE ALL ON margin_rules FROM authenticated;

COMMIT;
