-- ECON-PILOT-01 — RLS manquante sur reservation_network_product (créée par
-- 0077, ERROR-level sur l'advisor Supabase : RLS jamais activée du tout).
--
-- Même pattern que drizzle/manual/0076 §2 (flight_booking_passengers etc.) :
-- pas de agency_id direct sur cette table, mais reservation_id NOT NULL
-- (ON DELETE CASCADE) → scope via reservations.agency_id.
--
-- Le rôle applicatif réel de DATABASE_URL est `postgres` (rolbypassrls=true)
-- — RLS est inerte pour la connexion serveur actuelle (voir 0061/0076).
-- Renforcement défense-en-profondeur contre tout accès direct anon/
-- authenticated via PostgREST/Supabase client, pas un correctif d'un bug
-- fonctionnel observé.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0078_econ_pilot_01_rls.sql
--
-- Idempotent (DROP POLICY IF EXISTS / CREATE POLICY, ENABLE ROW LEVEL
-- SECURITY est lui-même idempotent).

BEGIN;

ALTER TABLE reservation_network_product ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservation_network_product_tenant_isolation" ON reservation_network_product;
CREATE POLICY "reservation_network_product_tenant_isolation" ON reservation_network_product
  FOR ALL
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = reservation_network_product.reservation_id
        AND r.agency_id = current_agency_id()
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = reservation_network_product.reservation_id
        AND r.agency_id = current_agency_id()
    )
  );

COMMIT;
