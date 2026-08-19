-- =============================================================================
-- Easy2Book — Correctif policies suppliers/supplier_modules/supplier_logs
-- =============================================================================
-- Trouvé en appliquant 0012_rls_session_context.sql pour de vrai sur le
-- projet Supabase : les policies de 0010_v6_financials_suppliers_validations_rls.sql
-- pour ces 3 tables utilisent `auth.role() = 'authenticated'`, qui dépend de
-- PostgREST (comme `auth.uid()` — voir 0012) et ne se résout jamais sur notre
-- connexion directe. Résultat : après FORCE ROW LEVEL SECURITY, ces 3 tables
-- (utilisées par /admin/suppliers) seraient devenues illisibles pour l'app
-- elle-même.
--
-- Correctif : même critère que le reste de 0012 — accessible dès qu'un
-- contexte de session a été posé par resolveSessionContext() (peu importe
-- l'agence, puisque ces tables sont partagées entre agences, restriction de
-- rôle staff = applicative, cf. commentaire d'origine dans 0010).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0013_suppliers_policy_fix.sql
--
-- Dépend de : 0010_v6_financials_suppliers_validations_rls.sql, 0012_rls_session_context.sql
-- Idempotent : peut être réexécuté sans effet de bord.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['suppliers', 'supplier_modules', 'supplier_logs'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "%1$s_staff_access" ON %1$I;
      CREATE POLICY "%1$s_staff_access" ON %1$I
        FOR ALL
        USING (
          is_super_admin()
          OR COALESCE(current_setting(''app.current_user_id'', TRUE), '''') != ''''
        )
        WITH CHECK (
          is_super_admin()
          OR COALESCE(current_setting(''app.current_user_id'', TRUE), '''') != ''''
        );
    ', t);
  END LOOP;
END $$;

COMMIT;
