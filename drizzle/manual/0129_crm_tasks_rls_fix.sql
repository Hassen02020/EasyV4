-- CRM-C-RLS-FIX-01 : corriger les policies crm_tasks
--
-- Bug : 0128_crm_tasks_01.sql a créé 3 policies utilisant auth.uid()
-- (mécanisme PostgREST/JWT). Pour le rôle app_runtime (Server Actions),
-- auth.uid() retourne NULL → SELECT = 0 lignes, INSERT/UPDATE rejeté.
-- Pattern correct : current_agency_id() OR is_super_admin() (GUC-based).
--
-- Également : révoquer les grants anon/authenticated accordés par
-- DEFAULT PRIVILEGES — non nécessaires, surface d'attaque inutile.
--
-- Note d'application : DROP POLICY timeout sur Supabase MCP (60s) ;
-- utilisé ALTER POLICY (modification in-place, sémantiquement identique).

ALTER POLICY crm_tasks_select_own_agency ON crm_tasks
  USING (agency_id = current_agency_id() OR is_super_admin());

ALTER POLICY crm_tasks_insert_own_agency ON crm_tasks
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

ALTER POLICY crm_tasks_update_own_agency ON crm_tasks
  USING (agency_id = current_agency_id() OR is_super_admin());

REVOKE ALL ON crm_tasks FROM anon;
REVOKE ALL ON crm_tasks FROM authenticated;
