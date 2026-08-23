-- Phase 18 — corrige un second défaut RLS pré-existant sur `users`,
-- découvert en vérifiant en direct les nouvelles actions de gestion du
-- personnel (lib/admin/users-actions.ts) : `users_manager_insert/update/
-- delete` (0028_fix_users_manager_write_recursion.sql) authentifient
-- l'acteur via `me.id = auth.uid()`. Or `auth.uid()` lit le GUC PostgREST
-- `request.jwt.claim.sub` (voir `auth.uid()` — SELECT nullif(current_setting
-- ('request.jwt.claim.sub', true), '')::uuid), jamais posé par la connexion
-- Postgres directe de cette app (postgres-js/Drizzle, voir
-- lib/db/tenant-context.ts) : seuls les GUC `app.current_agency_id` /
-- `app.current_user_id` / `app.is_super_admin` le sont.
--
-- Conséquence réelle : `auth.uid()` valait TOUJOURS NULL pour cette
-- connexion, donc `me.id = auth.uid()` ne matchait JAMAIS AUCUNE ligne —
-- seul `is_super_admin()` pouvait donc jamais autoriser une écriture sur
-- `users`. Un manager (non super_admin) ne pouvait donc RÉELLEMENT jamais
-- créer/modifier/suspendre un membre de son équipe, quel que soit le code
-- applicatif au-dessus — la Phase 18 (gestion réelle du personnel) aurait
-- silencieusement échoué pour tout manager.
--
-- Correctif : remplace `auth.uid()` par le GUC applicatif
-- `app.current_user_id`, déjà posé par `withTenantContext` et déjà utilisé
-- par ce même motif ailleurs (drizzle/manual/0013_suppliers_policy_fix.sql).
-- Nouvelle fonction `current_user_id()` pour rester lisible, même style que
-- `current_agency_id()`.

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')::uuid
$$;

DROP POLICY IF EXISTS "users_manager_insert" ON users;
DROP POLICY IF EXISTS "users_manager_update" ON users;
DROP POLICY IF EXISTS "users_manager_delete" ON users;

CREATE POLICY "users_manager_insert" ON users
  FOR INSERT WITH CHECK (
    is_super_admin() OR (
      agency_id = current_agency_id() AND EXISTS (
        SELECT 1 FROM users me
        WHERE me.id = current_user_id() AND me.role IN ('manager', 'super_admin')
      )
    )
  );

CREATE POLICY "users_manager_update" ON users
  FOR UPDATE USING (
    is_super_admin() OR (
      agency_id = current_agency_id() AND EXISTS (
        SELECT 1 FROM users me
        WHERE me.id = current_user_id() AND me.role IN ('manager', 'super_admin')
      )
    )
  )
  WITH CHECK (
    is_super_admin() OR (
      agency_id = current_agency_id() AND EXISTS (
        SELECT 1 FROM users me
        WHERE me.id = current_user_id() AND me.role IN ('manager', 'super_admin')
      )
    )
  );

CREATE POLICY "users_manager_delete" ON users
  FOR DELETE USING (
    is_super_admin() OR (
      agency_id = current_agency_id() AND EXISTS (
        SELECT 1 FROM users me
        WHERE me.id = current_user_id() AND me.role IN ('manager', 'super_admin')
      )
    )
  );
