-- =============================================================================
-- Easy2Book — Documentation a posteriori : rôle `app_runtime` + correctifs RLS
-- appliqués directement en production via Supabase SQL Editor (reconciliation
-- live confirmée par l'utilisateur), jamais rejoués depuis un fichier
-- versionné jusqu'ici. Ce fichier n'apporte rien de nouveau : il capture
-- l'état déjà en place pour que le dépôt reste la source de vérité.
--
-- Contexte (reconciliation production live) :
--   - Rôle applicatif réel de DATABASE_URL confirmé = `postgres`
--     (rolbypassrls = true) — RLS actuellement inerte pour ce rôle. Ce
--     fichier prépare `app_runtime` comme futur rôle restreint, non encore
--     utilisé par DATABASE_URL (bascule non faite, décision séparée).
--   - is_super_admin() confirmée être encore la version 0001 (auth.uid())
--     en production avant cette session — remplacée en direct par la
--     version 0012 (GUC-based), seule compatible avec
--     lib/db/tenant-context.ts.
--   - Inventaire RLS complet des 35 tables réelles de production (pas les
--     tables attendues par le dépôt — beaucoup de migrations manuelles et
--     drizzle-kit restent non appliquées, voir reconciliation) : 28 tables
--     avaient déjà une policy fonctionnelle sans restriction de rôle
--     (compatibles app_runtime). 7 avaient RLS activée mais AUCUNE policy
--     (deny-all pour tout rôle non-propriétaire) : `notifications` et les
--     6 tables du module Omra (`omra_allotments`, `omra_flights`,
--     `omra_hotels`, `omra_packages`, `omra_pilgrims`,
--     `omra_room_allocations`). Corrigé ici.
--
-- Hors périmètre, volontairement non touché :
--   - `wallets`/`wallet_transactions` (0006) : table absente en production,
--     confirmé par `relation "wallets" does not exist`. Rien à corriger.
--   - Bascule DATABASE_URL vers app_runtime : décision séparée, non faite.
--   - `notifications` (table entière) et `omra_packages.name_ar/.slug/
--     .formule` : présents en production sans trace dans aucune migration
--     du dépôt (drizzle-kit ou manual) — schéma non capturé ici, seules
--     leurs policies RLS le sont.
--   - `reservations.confirmed_at` existe alors que `audit_logs`/`products`
--     (même fichier source drizzle-kit 0003_chemical_slapstick.sql)
--     n'existent pas — preuve d'application partielle historique de ce
--     fichier, non corrigée ici (hors périmètre RLS).
--
-- Application (déjà faite en production ; ce fichier est idempotent si
-- rejoué) :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0061_app_runtime_role_and_rls_gaps.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. is_super_admin() — remplace la version 0001 (auth.uid(), inerte en
--    connexion directe postgres-js) par la version 0012 (GUC-based).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.is_super_admin', TRUE), 'false') = 'true'
$$;

-- -----------------------------------------------------------------------------
-- 2. Policies manquantes — notifications + module Omra (RLS activée mais
--    aucune policy trouvée en production, confirmé via pg_policies).
--    Guardées par DROP IF EXISTS pour rester idempotent.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_tenant_isolation" ON notifications;
CREATE POLICY "notifications_tenant_isolation" ON notifications
  FOR ALL
  USING (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

DROP POLICY IF EXISTS "omra_packages_tenant_isolation" ON omra_packages;
CREATE POLICY "omra_packages_tenant_isolation" ON omra_packages
  FOR ALL
  USING (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

-- omra_allotments/omra_flights/omra_room_allocations : pas de colonne
-- agency_id, scoping via package_id -> omra_packages.agency_id (la seule FK
-- fiable ; reservation_id n'a pas de contrainte FK, hotel_id pointe vers un
-- catalogue partagé entre agences).
DROP POLICY IF EXISTS "omra_allotments_tenant_isolation" ON omra_allotments;
CREATE POLICY "omra_allotments_tenant_isolation" ON omra_allotments
  FOR ALL
  USING (
    is_super_admin()
    OR package_id IN (SELECT id FROM omra_packages WHERE agency_id = current_agency_id())
  )
  WITH CHECK (
    is_super_admin()
    OR package_id IN (SELECT id FROM omra_packages WHERE agency_id = current_agency_id())
  );

DROP POLICY IF EXISTS "omra_flights_tenant_isolation" ON omra_flights;
CREATE POLICY "omra_flights_tenant_isolation" ON omra_flights
  FOR ALL
  USING (
    is_super_admin()
    OR package_id IN (SELECT id FROM omra_packages WHERE agency_id = current_agency_id())
  )
  WITH CHECK (
    is_super_admin()
    OR package_id IN (SELECT id FROM omra_packages WHERE agency_id = current_agency_id())
  );

DROP POLICY IF EXISTS "omra_room_allocations_tenant_isolation" ON omra_room_allocations;
CREATE POLICY "omra_room_allocations_tenant_isolation" ON omra_room_allocations
  FOR ALL
  USING (
    is_super_admin()
    OR package_id IN (SELECT id FROM omra_packages WHERE agency_id = current_agency_id())
  )
  WITH CHECK (
    is_super_admin()
    OR package_id IN (SELECT id FROM omra_packages WHERE agency_id = current_agency_id())
  );

DROP POLICY IF EXISTS "omra_pilgrims_tenant_isolation" ON omra_pilgrims;
CREATE POLICY "omra_pilgrims_tenant_isolation" ON omra_pilgrims
  FOR ALL
  USING (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

-- omra_hotels : catalogue plateforme partagé entre agences (aucune FK vers
-- agencies ni omra_packages) -- même pattern que destinations_select/
-- hotel_suppliers_select (0035/0054) : lecture pour toute session réelle,
-- écriture réservée au Master Admin.
DROP POLICY IF EXISTS "omra_hotels_select" ON omra_hotels;
CREATE POLICY "omra_hotels_select" ON omra_hotels
  FOR SELECT
  USING (current_setting('app.current_user_id', true) IS NOT NULL AND current_setting('app.current_user_id', true) <> '');

DROP POLICY IF EXISTS "omra_hotels_admin_write" ON omra_hotels;
CREATE POLICY "omra_hotels_admin_write" ON omra_hotels
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

COMMIT;

-- =============================================================================
-- 3. Rôle app_runtime — DÉJÀ CRÉÉ en production (CREATE ROLE + GRANT confirmés
-- exécutés avec succès). Non ré-exécutable via ce fichier : CREATE ROLE n'est
-- pas idempotent nativement (pas d'IF NOT EXISTS), et le mot de passe n'a
-- jamais transité par cette session ni ce dépôt. Documenté ici pour mémoire,
-- pas destiné à être rejoué tel quel :
--
--   CREATE ROLE app_runtime LOGIN PASSWORD '<jamais versionné>';
--   GRANT USAGE ON SCHEMA public TO app_runtime;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
--   GRANT EXECUTE ON FUNCTION resolve_session_context(uuid) TO app_runtime;
--
-- DATABASE_URL ne pointe PAS encore sur ce rôle — décision et bascule
-- séparées, non faites à ce jour.
-- =============================================================================
