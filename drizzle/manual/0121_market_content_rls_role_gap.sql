-- Migration 0121 — MARKET-CONTENT-RLS-ROLE-GAP-01 (2026-10-06)
--
-- Trouvé en auditant RLS-GAP-PUBLIC-TABLES-01 : les 4 policies de
-- market_signals/development_projects (migration 0094) sont scopées
-- TO authenticated — un rôle Supabase/PostgREST dont app_runtime (le rôle
-- Postgres réel utilisé par DATABASE_URL) n'est jamais membre. Avec FORCE
-- ROW LEVEL SECURITY, aucune policy ne s'applique à app_runtime :
--   - lecture (getLatestMarketSignals/getLatestDevelopmentProjects,
--     sections homepage) : 0 ligne silencieuse ;
--   - écriture super_admin (lib/market/admin-actions.ts) : erreur explicite
--     "new row violates row-level security policy".
-- Même famille que PUBLIC-VISUAL-RLS-ROLE-GAP-01 (0119) — même correctif :
-- recréer les policies sans restriction de rôle (TO authenticated retiré),
-- même convention que 0119. Aucun grant touché (déjà corrects pour
-- app_runtime : SELECT/INSERT/UPDATE/DELETE).
--
-- Ne corrige QUE le rôle — is_super_admin() reste la garde DB pour
-- l'écriture (décision explicite : garder le contrôle en profondeur côté
-- DB, ne pas se reposer uniquement sur le garde applicatif
-- requireSuperAdmin()). Pour que ça fonctionne réellement, le GUC
-- app.is_super_admin doit être positionné par l'appelant — voir le wiring
-- withSystemContext() ajouté dans lib/market/admin-actions.ts dans le même
-- chantier.

BEGIN;

DROP POLICY IF EXISTS market_signals_read ON market_signals;
CREATE POLICY market_signals_read
  ON market_signals
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS market_signals_admin_write ON market_signals;
CREATE POLICY market_signals_admin_write
  ON market_signals
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS development_projects_read ON development_projects;
CREATE POLICY development_projects_read
  ON development_projects
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS development_projects_admin_write ON development_projects;
CREATE POLICY development_projects_admin_write
  ON development_projects
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

COMMIT;

-- Retour arrière : réappliquer drizzle/manual/0094_market_signals_rls.sql
-- tel quel (policies TO authenticated d'origine).
