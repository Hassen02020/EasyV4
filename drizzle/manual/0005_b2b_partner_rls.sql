-- =============================================================================
-- Easy2Book OTA — RLS pour les tables B2B (Portail Partenaire)
-- =============================================================================
-- Ce fichier accompagne la migration Drizzle `0001_b2b_portal_partner.sql`
-- (qui crée les 4 tables `pricing_margins`, `partner_invoices`,
-- `partner_payments`, `partner_credit_movements` ainsi que les enums et les
-- nouveaux champs sur `agencies`).
--
-- Drizzle ne génère PAS de RLS — on doit donc activer manuellement les policies
-- de tenant-isolation sur les nouvelles tables.
--
-- Dépend de :
--   • drizzle/0001_b2b_portal_partner.sql (tables + enums créés)
--   • drizzle/manual/0001_rls_policies.sql (fonctions current_agency_id() +
--     is_super_admin() définies)
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0005_b2b_partner_rls.sql
--
-- Idempotent : peut être réexécuté sans effet de bord.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Activation RLS sur les 4 tables B2B
-- -----------------------------------------------------------------------------
ALTER TABLE pricing_margins ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_credit_movements ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. Policies de tenant-isolation (générique, par batch)
--    Repose sur les fonctions current_agency_id() et is_super_admin() définies
--    dans drizzle/manual/0001_rls_policies.sql.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'pricing_margins',
    'partner_invoices',
    'partner_payments',
    'partner_credit_movements'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "%1$s_tenant_isolation" ON %1$I;
      CREATE POLICY "%1$s_tenant_isolation" ON %1$I
        FOR ALL
        USING (agency_id = current_agency_id() OR is_super_admin())
        WITH CHECK (agency_id = current_agency_id() OR is_super_admin());
    ', t);
  END LOOP;
END $$;

COMMIT;
