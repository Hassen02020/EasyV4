-- Phase 17 — corrige une régression RLS pré-existante trouvée en
-- vérification live : `users_manager_write` (0001_rls_policies.sql) est
-- déclarée `FOR ALL`, donc s'applique aussi au SELECT, en plus de
-- `users_select`. Sa sous-requête `SELECT 1 FROM users me WHERE me.id =
-- auth.uid() ...` re-déclenche alors l'évaluation RLS sur `users`, qui
-- ré-évalue à nouveau `users_manager_write` (toujours `FOR ALL`) sur la même
-- ligne — récursion infinie détectée par Postgres pour TOUTE session
-- non-super_admin (is_super_admin() ne peut pas court-circuiter le OR
-- puisqu'il est faux).
--
-- Effet réel en production : tout SELECT sur `users` par un manager/agent
-- (agencyId scopé, isSuperAdmin: false) échoue avec "infinite recursion
-- detected in policy for relation users" — ce qui casse déjà
-- `/admin/staff` (lib usage : app/admin/staff/page.tsx) et
-- `/pro/utilisateurs` (lib/pro/users-data.ts), tous deux audités "🟢 REAL"
-- en Phase 17 sans que ce bug n'ait été détecté avant ce test live.
--
-- Correctif : restreindre `users_manager_write` aux commandes d'écriture
-- (INSERT/UPDATE/DELETE) — le SELECT reste entièrement gouverné par
-- `users_select` (déjà sans auto-référence). La sous-requête interne
-- `SELECT 1 FROM users me ...` n'est alors plus évaluée que sous
-- `users_select`, qui termine immédiatement (id = auth.uid() couvre
-- toujours la ligne de l'appelant, quelle que soit son agence).

DROP POLICY IF EXISTS "users_manager_write" ON users;

CREATE POLICY "users_manager_insert" ON users
  FOR INSERT WITH CHECK (
    is_super_admin() OR (
      agency_id = current_agency_id() AND EXISTS (
        SELECT 1 FROM users me
        WHERE me.id = auth.uid() AND me.role IN ('manager', 'super_admin')
      )
    )
  );

CREATE POLICY "users_manager_update" ON users
  FOR UPDATE USING (
    is_super_admin() OR (
      agency_id = current_agency_id() AND EXISTS (
        SELECT 1 FROM users me
        WHERE me.id = auth.uid() AND me.role IN ('manager', 'super_admin')
      )
    )
  )
  WITH CHECK (
    is_super_admin() OR (
      agency_id = current_agency_id() AND EXISTS (
        SELECT 1 FROM users me
        WHERE me.id = auth.uid() AND me.role IN ('manager', 'super_admin')
      )
    )
  );

CREATE POLICY "users_manager_delete" ON users
  FOR DELETE USING (
    is_super_admin() OR (
      agency_id = current_agency_id() AND EXISTS (
        SELECT 1 FROM users me
        WHERE me.id = auth.uid() AND me.role IN ('manager', 'super_admin')
      )
    )
  );
