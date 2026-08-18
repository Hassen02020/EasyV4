-- =============================================================================
-- Easy2Book — RLS pour le module Location de Voitures (Car Rental)
-- =============================================================================
-- Accompagne la migration Drizzle `0010_car_rental_module.sql`.
--
-- Toutes les tables de ce module portent `agency_id` directement (y compris
-- `reservation_car`, qui le duplique depuis `reservations` comme le font déjà
-- `reservation_transfer`/`reservation_omra`) — même pattern générique
-- `agency_id = current_agency_id() OR is_super_admin()` que
-- drizzle/manual/0001_rls_policies.sql et 0005_b2b_partner_rls.sql.
--
-- Dépend de :
--   • drizzle/0010_car_rental_module.sql (tables + enums créés)
--   • drizzle/manual/0001_rls_policies.sql (fonctions current_agency_id() +
--     is_super_admin() définies)
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0011_car_rental_rls.sql
--
-- Idempotent : peut être réexécuté sans effet de bord.
-- =============================================================================

BEGIN;

ALTER TABLE car_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE car_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE car_fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE car_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE car_pricing_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_car ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'car_locations',
    'car_categories',
    'car_fleet_vehicles',
    'car_availability',
    'car_pricing_rates',
    'reservation_car'
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
