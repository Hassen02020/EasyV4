-- DISTRIBUTION-01 (suite de 0079) — RLS sur `products` (ECON-PILOT-01),
-- jamais activée jusqu'ici (ERROR-level advisor Supabase). Même pattern
-- que les tables catalogue existantes (0023_commerce_completion.sql) :
-- agence propriétaire, OU autorisation active via product_authorizations,
-- OU super_admin.

BEGIN;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_tenant_isolation" ON products;
CREATE POLICY "products_tenant_isolation" ON products
  FOR ALL
  USING (
    is_super_admin()
    OR agency_id = current_agency_id()
    OR EXISTS (
      SELECT 1 FROM product_authorizations pa
      WHERE pa.product_type = 'network'
        AND pa.product_id = products.id
        AND pa.agency_id = current_agency_id()
        AND pa.is_active = true
    )
  )
  WITH CHECK (
    is_super_admin()
    OR agency_id = current_agency_id()
  );

COMMIT;
