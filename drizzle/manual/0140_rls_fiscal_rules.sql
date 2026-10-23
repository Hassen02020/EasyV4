-- =============================================================================
-- RLS-FISCAL-RULES-01 : Activer RLS sur fiscal_rules
-- =============================================================================
-- La table fiscal_rules créée dans 0022_fiscal_rules.sql n'avait pas de RLS.
-- Sans RLS, tout utilisateur authentifié pouvait lire les règles fiscales
-- (taux TVA, références de validation) via PostgREST REST API.
--
-- Correctif : ENABLE ROW LEVEL SECURITY + policy is_super_admin() — même
-- pattern que fx_policies (0098_fx_policy_rls_fix.sql) et les autres tables
-- financières sensibles du projet.
--
-- Note : getActiveFiscalRuleInTx() (booking path) utilise DATABASE_URL /
-- service role (bypass RLS) — non impacté par cette migration.
--
-- Réversible :
--   DROP POLICY fiscal_rules_super_admin ON fiscal_rules;
--   ALTER TABLE fiscal_rules DISABLE ROW LEVEL SECURITY;
-- =============================================================================

BEGIN;

ALTER TABLE fiscal_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_rules_super_admin ON fiscal_rules;

CREATE POLICY fiscal_rules_super_admin ON fiscal_rules
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

COMMIT;
