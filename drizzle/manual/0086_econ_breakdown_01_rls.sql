-- ECON-BREAKDOWN-01 — RLS sur economic_entitlements (créée par 0085).
--
-- Même pattern EXACT que `reservation_financials` (0012_rls_session_context.sql)
-- et `reservation_network_product` (0078_econ_pilot_01_rls.sql) : pas de
-- `agency_id` direct sur cette table (child-of-reservation), donc isolation
-- via un EXISTS sur `reservations.agency_id` par `reservation_id`
-- (ON DELETE CASCADE). Aucune policy inventée : réutilisation à l'identique
-- de la policy déjà prouvée en production sur ces deux tables.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0086_econ_breakdown_01_rls.sql
--
-- Idempotent (DROP POLICY IF EXISTS / CREATE POLICY ; ENABLE/FORCE ROW LEVEL
-- SECURITY sont eux-mêmes idempotents). Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

ALTER TABLE economic_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "economic_entitlements_tenant_isolation" ON economic_entitlements;
CREATE POLICY "economic_entitlements_tenant_isolation" ON economic_entitlements
  FOR ALL
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = economic_entitlements.reservation_id
        AND r.agency_id = current_agency_id()
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = economic_entitlements.reservation_id
        AND r.agency_id = current_agency_id()
    )
  );

-- FORCE ROW LEVEL SECURITY : cohérent avec 0012 §4 — s'applique aussi au
-- propriétaire de la table (jamais aux rôles superuser/BYPASSRLS).
ALTER TABLE economic_entitlements FORCE ROW LEVEL SECURITY;

COMMIT;

-- Retour arrière :
--   DROP POLICY IF EXISTS "economic_entitlements_tenant_isolation" ON economic_entitlements;
--   ALTER TABLE economic_entitlements NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE economic_entitlements DISABLE ROW LEVEL SECURITY;
