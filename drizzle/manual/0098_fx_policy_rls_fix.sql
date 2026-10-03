-- =============================================================================
-- FIX-RLS-01 : Corriger la policy RLS de fx_policies
-- =============================================================================
-- La policy `fx_policies_super_admin` créée dans 0091_fx_policy.sql utilise
-- `auth.uid()` pour identifier le super_admin. Or `auth.uid()` lit le GUC
-- PostgREST `request.jwt.claim.sub` (NULL sur connexion directe postgres-js).
-- Conséquence : tout accès à fx_policies (lecture du taux FX actif avant un
-- booking multi-devise) échoue silencieusement ou lève une erreur RLS.
--
-- Correctif : remplacer par `is_super_admin()` (GUC pattern
-- `app.current_user_id` + lookup profiles) — même pattern que toutes les
-- autres policies super_admin du projet (0061, 0088, etc.).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0098_fx_policy_rls_fix.sql
--
-- Dépend de : 0091_fx_policy.sql, 0061_app_runtime_role_and_rls_gaps.sql
-- Idempotent : peut être réexécuté sans effet de bord.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS fx_policies_super_admin ON fx_policies;

CREATE POLICY fx_policies_super_admin ON fx_policies
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

COMMIT;
