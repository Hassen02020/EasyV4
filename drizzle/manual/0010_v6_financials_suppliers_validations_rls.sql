-- =============================================================================
-- Easy2Book V6 — RLS pour les 15 tables Financials / Suppliers / Validations
-- =============================================================================
-- Accompagne la migration Drizzle `0009_v6_financials_suppliers_validations.sql`
-- qui crée (enfin, en tant que migration TRACKÉE) : wallet_accounts,
-- wallet_ledger, margin_rules, journal_entries, journal_lines,
-- reservation_financials, reservation_status_history, reservation_validations,
-- validation_comments, validation_history, suppliers, supplier_modules,
-- supplier_logs, product_inventory, api_logs.
--
-- Drizzle ne génère pas de RLS — comme pour les migrations précédentes
-- (0001_rls_policies.sql, 0005_b2b_partner_rls.sql, 0006_wallet_rls.sql),
-- on l'active manuellement ici.
--
-- Dépend de : drizzle/manual/0001_rls_policies.sql (current_agency_id(),
-- is_super_admin()).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0010_v6_financials_suppliers_validations_rls.sql
--
-- Idempotent : peut être réexécuté sans effet de bord.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tables avec agency_id direct — isolation standard
-- -----------------------------------------------------------------------------
ALTER TABLE wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'wallet_accounts',
    'margin_rules',
    'journal_entries'
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

-- -----------------------------------------------------------------------------
-- 2. Tables scopées par agence via FK à 1 saut (pas de agency_id direct)
-- -----------------------------------------------------------------------------
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_ledger_tenant_isolation" ON wallet_ledger;
CREATE POLICY "wallet_ledger_tenant_isolation" ON wallet_ledger
  FOR ALL USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM wallet_accounts wa
      WHERE wa.id = wallet_ledger.wallet_account_id
        AND wa.agency_id = current_agency_id()
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM wallet_accounts wa
      WHERE wa.id = wallet_ledger.wallet_account_id
        AND wa.agency_id = current_agency_id()
    )
  );

DROP POLICY IF EXISTS "journal_lines_tenant_isolation" ON journal_lines;
CREATE POLICY "journal_lines_tenant_isolation" ON journal_lines
  FOR ALL USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = journal_lines.journal_entry_id
        AND je.agency_id = current_agency_id()
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = journal_lines.journal_entry_id
        AND je.agency_id = current_agency_id()
    )
  );

DROP POLICY IF EXISTS "reservation_financials_tenant_isolation" ON reservation_financials;
CREATE POLICY "reservation_financials_tenant_isolation" ON reservation_financials
  FOR ALL USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = reservation_financials.reservation_id
        AND r.agency_id = current_agency_id()
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = reservation_financials.reservation_id
        AND r.agency_id = current_agency_id()
    )
  );

DROP POLICY IF EXISTS "reservation_status_history_tenant_isolation" ON reservation_status_history;
CREATE POLICY "reservation_status_history_tenant_isolation" ON reservation_status_history
  FOR ALL USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = reservation_status_history.reservation_id
        AND r.agency_id = current_agency_id()
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = reservation_status_history.reservation_id
        AND r.agency_id = current_agency_id()
    )
  );

DROP POLICY IF EXISTS "reservation_validations_tenant_isolation" ON reservation_validations;
CREATE POLICY "reservation_validations_tenant_isolation" ON reservation_validations
  FOR ALL USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = reservation_validations.reservation_id
        AND r.agency_id = current_agency_id()
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = reservation_validations.reservation_id
        AND r.agency_id = current_agency_id()
    )
  );

DROP POLICY IF EXISTS "product_inventory_tenant_isolation" ON product_inventory;
CREATE POLICY "product_inventory_tenant_isolation" ON product_inventory
  FOR ALL USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_inventory.product_id
        AND p.agency_id = current_agency_id()
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_inventory.product_id
        AND p.agency_id = current_agency_id()
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Tables scopées par agence via FK à 2 sauts (validation_* → reservation_validations → reservations)
-- -----------------------------------------------------------------------------
ALTER TABLE validation_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "validation_comments_tenant_isolation" ON validation_comments;
CREATE POLICY "validation_comments_tenant_isolation" ON validation_comments
  FOR ALL USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservation_validations rv
      JOIN reservations r ON r.id = rv.reservation_id
      WHERE rv.id = validation_comments.validation_id
        AND r.agency_id = current_agency_id()
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservation_validations rv
      JOIN reservations r ON r.id = rv.reservation_id
      WHERE rv.id = validation_comments.validation_id
        AND r.agency_id = current_agency_id()
    )
  );

DROP POLICY IF EXISTS "validation_history_tenant_isolation" ON validation_history;
CREATE POLICY "validation_history_tenant_isolation" ON validation_history
  FOR ALL USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservation_validations rv
      JOIN reservations r ON r.id = rv.reservation_id
      WHERE rv.id = validation_history.validation_id
        AND r.agency_id = current_agency_id()
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservation_validations rv
      JOIN reservations r ON r.id = rv.reservation_id
      WHERE rv.id = validation_history.validation_id
        AND r.agency_id = current_agency_id()
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Suppliers — plateforme, pas tenant-scopées (fournisseurs partagés par
--    toutes les agences, gérés par le staff OTA — cf. /admin/suppliers,
--    restreint à super_admin/manager côté application). RLS ici ne fait que
--    bloquer l'accès anonyme/client ; l'isolation par rôle reste applicative.
-- -----------------------------------------------------------------------------
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_staff_access" ON suppliers;
CREATE POLICY "suppliers_staff_access" ON suppliers
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "supplier_modules_staff_access" ON supplier_modules;
CREATE POLICY "supplier_modules_staff_access" ON supplier_modules
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "supplier_logs_staff_access" ON supplier_logs;
CREATE POLICY "supplier_logs_staff_access" ON supplier_logs
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- -----------------------------------------------------------------------------
-- 5. api_logs — journal technique des appels fournisseurs. reservation_id est
--    nullable (recherches sans réservation) : un staff standard ne voit que
--    les logs rattachables à une réservation de sa propre agence ; les logs
--    orphelins (recherche, pré-réservation) restent réservés au super_admin,
--    comme psp_webhooks dans 0001_rls_policies.sql.
-- -----------------------------------------------------------------------------
ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_logs_tenant_isolation" ON api_logs;
CREATE POLICY "api_logs_tenant_isolation" ON api_logs
  FOR ALL USING (
    is_super_admin() OR (
      api_logs.reservation_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM reservations r
        WHERE r.id = api_logs.reservation_id
          AND r.agency_id = current_agency_id()
      )
    )
  )
  WITH CHECK (is_super_admin());

COMMIT;
