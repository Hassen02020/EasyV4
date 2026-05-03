-- =============================================================================
-- TunisiaGo OTA — Row-Level Security (RLS) policies
-- =============================================================================
-- À appliquer manuellement APRÈS la migration auto Drizzle (0000_*.sql).
-- Ces policies activent l'isolation multi-tenant par `agency_id`.
--
-- Concept :
--   - Chaque session Postgres expose `app.current_agency_id` (UUID)
--     positionné côté serveur via `set_config()` après auth Supabase.
--   - Les tables filtrent automatiquement sur cette valeur.
--   - Le rôle `service_role` (Supabase) bypass RLS pour les tâches admin.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0001_rls_policies.sql
-- =============================================================================

-- Activation RLS sur toutes les tables métier
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_hotel ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_flight ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_package ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_transfer ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_omra ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE psp_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_package_departures ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_transfer_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_transfer_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_drivers ENABLE ROW LEVEL SECURITY;

-- Helper : récupère agency_id courant (NULL si non set)
CREATE OR REPLACE FUNCTION current_agency_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_agency_id', TRUE), '')::uuid
$$;

-- Helper : test si l'utilisateur courant est super_admin (cross-agency)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
      AND users.status = 'active'
  )
$$;

-- =============================================================================
-- Policies génériques par table
-- =============================================================================

-- agencies : tout le monde peut voir SA propre agence
CREATE POLICY "agencies_select" ON agencies
  FOR SELECT USING (id = current_agency_id() OR is_super_admin());

CREATE POLICY "agencies_admin_write" ON agencies
  FOR ALL USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- users : on voit les users de SON agence (et soi-même)
CREATE POLICY "users_select" ON users
  FOR SELECT USING (
    agency_id = current_agency_id() OR id = auth.uid() OR is_super_admin()
  );

CREATE POLICY "users_manager_write" ON users
  FOR ALL USING (
    is_super_admin() OR (
      agency_id = current_agency_id() AND EXISTS (
        SELECT 1 FROM users me
        WHERE me.id = auth.uid() AND me.role IN ('manager', 'super_admin')
      )
    )
  );

-- Pattern générique réutilisé : agency_id = current_agency_id()
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'customers',
    'exchange_rates',
    'reservations',
    'reservation_hotel',
    'reservation_flight',
    'reservation_package',
    'reservation_activity',
    'reservation_transfer',
    'reservation_omra',
    'payments',
    'audit_events',
    'catalog_packages',
    'catalog_package_departures',
    'catalog_activities',
    'catalog_activity_sessions',
    'catalog_transfer_zones',
    'catalog_transfer_pricing',
    'catalog_vehicles',
    'catalog_drivers'
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

-- psp_webhooks : pas d'agency au moment du webhook → policy permissive
-- (lecture restreinte aux super_admin / appli backend)
CREATE POLICY "psp_webhooks_admin" ON psp_webhooks
  FOR ALL USING (is_super_admin() OR agency_id = current_agency_id())
  WITH CHECK (TRUE);

-- =============================================================================
-- Permissions par défaut sur le schéma public pour les rôles Supabase
-- =============================================================================
-- (Supabase gère ça en partie automatiquement, on s'assure que c'est cohérent)
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON currencies TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
