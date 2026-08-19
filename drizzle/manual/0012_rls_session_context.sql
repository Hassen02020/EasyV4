-- =============================================================================
-- Easy2Book — Contexte de session RLS pour connexion directe (Drizzle/postgres-js)
-- =============================================================================
-- PROBLÈME RÉSOLU PAR CE FICHIER :
--
-- Toutes les policies RLS existantes (0001, 0005, 0006, 0010, 0011) reposent
-- sur deux fonctions :
--   • current_agency_id() → lit le GUC de session `app.current_agency_id`
--   • is_super_admin()    → jusqu'ici interrogeait `auth.uid()`
--
-- `auth.uid()` est fourni par Supabase via PostgREST/GoTrue, qui injecte le
-- JWT vérifié dans `request.jwt.claims` AVANT d'exécuter la requête SQL.
-- Notre application n'utilise PAS PostgREST : `lib/db/client.ts` ouvre une
-- connexion Postgres directe (postgres-js) avec `DATABASE_URL`. Sur cette
-- connexion, `request.jwt.claims` n'est JAMAIS positionné et `auth.uid()`
-- renvoie NULL en permanence → `is_super_admin()` était donc TOUJOURS FALSE,
-- et plus grave : **rien, nulle part dans le code applicatif, ne positionnait
-- jamais `app.current_agency_id`** (`grep -r "set_config" lib/` ne renvoie
-- aucun résultat côté application avant ce commit). Résultat concret :
--   • Si le rôle Postgres de `DATABASE_URL` est propriétaire des tables (cas
--     par défaut chez Supabase, migrations exécutées par ce même rôle) ou a
--     l'attribut BYPASSRLS, RLS ne s'applique JAMAIS à lui : les policies
--     existent mais sont inertes, et l'app compte alors intégralement sur ses
--     `WHERE agency_id = ...` applicatifs (aucune défense en profondeur).
--   • Si ce rôle N'A PAS BYPASSRLS (recommandé — voir section 4), RLS
--     s'applique mais `current_agency_id()` valant toujours NULL, TOUTE
--     requête (y compris légitime) est bloquée : fail-closed total.
--
-- Ce fichier corrige les deux : (1) is_super_admin() ne dépend plus de
-- auth.uid() ; (2) une fonction SECURITY DEFINER permet à l'app de résoudre
-- l'agence de l'utilisateur AVANT que le contexte ne soit posé (problème de
-- la poule et de l'œuf : la policy `users_select` a besoin du contexte pour
-- s'évaluer, mais on a besoin de lire `users` pour connaître ce contexte).
-- Contrepartie applicative : `lib/db/tenant-context.ts`
-- (`resolveSessionContext()` + `withTenantContext()`).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0012_rls_session_context.sql
--
-- Dépend de : 0001, 0005, 0006, 0010, 0011 (déjà appliqués).
-- Idempotent : peut être réexécuté sans effet de bord.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. is_super_admin() — ne dépend plus de auth.uid() (inutilisable en
--    connexion directe), lit le GUC `app.is_super_admin` posé par l'app après
--    vérification du rôle réel dans `users` via resolve_session_context().
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('app.is_super_admin', TRUE), 'false') = 'true'
$$;

-- -----------------------------------------------------------------------------
-- 2. resolve_session_context() — bootstrap : résout agency_id/role/status pour
--    un user_id donné, EN CONTOURNANT la RLS de `users` (SECURITY DEFINER).
--
--    ⚠️ SÉCURITÉ : `p_user_id` ne doit JAMAIS provenir d'une entrée client.
--    Cette fonction doit uniquement être appelée par du code serveur de
--    confiance, avec l'id issu d'un JWT Supabase déjà vérifié
--    (`supabase.auth.getUser()` côté serveur — voir
--    `lib/db/tenant-context.ts::resolveSessionContext`). Elle ne renvoie que
--    agency_id/role/status : aucune donnée sensible (pas d'email, pas de
--    mot de passe).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_session_context(p_user_id uuid)
RETURNS TABLE(agency_id uuid, role text, status text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT u.agency_id, u.role::text, u.status::text
  FROM users u
  WHERE u.id = p_user_id
$$;

REVOKE ALL ON FUNCTION resolve_session_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_session_context(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. wallets / wallet_transactions (0006_wallet_rls.sql) — les policies
--    d'origine comparaient `agency_id = (SELECT agency_id FROM users WHERE id
--    = auth.uid())`, également cassé en connexion directe pour la même
--    raison. Remplacées par le pattern standard current_agency_id() /
--    is_super_admin() utilisé partout ailleurs (0001, 0005, 0010, 0011).
--    La policy `*_service_bypass USING (true)` est supprimée : elle rendait
--    RLS inerte pour QUICONQUE l'atteignait, alors que `service_role` bypass
--    déjà RLS nativement côté Supabase (attribut BYPASSRLS du rôle) — cette
--    policy permissive était une porte dérobée involontaire, pas une
--    protection.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "wallet_agency_isolation" ON wallets;
DROP POLICY IF EXISTS "wallet_service_bypass" ON wallets;
DROP POLICY IF EXISTS "wallet_tx_agency_isolation" ON wallet_transactions;
DROP POLICY IF EXISTS "wallet_tx_service_bypass" ON wallet_transactions;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['wallets', 'wallet_transactions'];
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
-- 4. FORCE ROW LEVEL SECURITY sur toutes les tables métier.
--
--    Sans FORCE, Postgres exempte automatiquement de RLS le PROPRIÉTAIRE de
--    la table (typiquement le rôle qui a exécuté les migrations) — ce qui est
--    très probablement le même rôle que celui de `DATABASE_URL` chez la
--    plupart des projets Supabase. FORCE fait que RLS s'applique aussi au
--    propriétaire (mais jamais aux rôles superuser ou BYPASSRLS — voir §5).
--
--    Liste = union de toutes les tables ALTER'ed dans 0001, 0005, 0006, 0010,
--    0011 (48 tables).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    -- 0001_rls_policies.sql
    'agencies', 'users', 'customers', 'exchange_rates', 'reservations',
    'reservation_hotel', 'reservation_flight', 'reservation_package',
    'reservation_activity', 'reservation_transfer', 'reservation_omra',
    'payments', 'psp_webhooks', 'audit_events', 'catalog_packages',
    'catalog_package_departures', 'catalog_activities',
    'catalog_activity_sessions', 'catalog_transfer_zones',
    'catalog_transfer_pricing', 'catalog_vehicles', 'catalog_drivers',
    -- 0005_b2b_partner_rls.sql
    'pricing_margins', 'partner_invoices', 'partner_payments',
    'partner_credit_movements',
    -- 0006_wallet_rls.sql
    'wallets', 'wallet_transactions',
    -- 0010_v6_financials_suppliers_validations_rls.sql
    'wallet_accounts', 'margin_rules', 'journal_entries', 'wallet_ledger',
    'journal_lines', 'reservation_financials', 'reservation_status_history',
    'reservation_validations', 'product_inventory', 'validation_comments',
    'validation_history', 'suppliers', 'supplier_modules', 'supplier_logs',
    'api_logs',
    -- 0011_car_rental_rls.sql
    'car_locations', 'car_categories', 'car_fleet_vehicles',
    'car_availability', 'car_pricing_rates', 'reservation_car'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- 5. PRÉREQUIS OPÉRATIONNEL — NON automatisable depuis ce script SQL
-- =============================================================================
-- FORCE ROW LEVEL SECURITY (§4) ne protège PAS contre un rôle superuser ou un
-- rôle ayant l'attribut BYPASSRLS : ceux-ci ignorent RLS quoi qu'il arrive.
--
-- Vérifier le rôle utilisé par `DATABASE_URL` :
--
--   SELECT rolname, rolsuper, rolbypassrls
--   FROM pg_roles
--   WHERE rolname = current_user;
--
-- Si `rolsuper` ou `rolbypassrls` = true, TOUT ce fichier est inerte pour les
-- requêtes applicatives et l'isolation multi-tenant ne repose que sur les
-- `WHERE agency_id = ...` du code (comme avant ce commit). Chez Supabase, le
-- rôle `postgres` fourni par défaut a historiquement BYPASSRLS. Recommandé :
--
--   -- Rôle dédié aux requêtes applicatives (non-superuser, non-BYPASSRLS) :
--   CREATE ROLE app_runtime LOGIN PASSWORD '<à générer, à stocker en secret>';
--   GRANT USAGE ON SCHEMA public TO app_runtime;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
--   GRANT EXECUTE ON FUNCTION resolve_session_context(uuid) TO app_runtime;
--   GRANT EXECUTE ON FUNCTION current_agency_id() TO app_runtime;
--   GRANT EXECUTE ON FUNCTION is_super_admin() TO app_runtime;
--   -- Puis pointer DATABASE_URL (runtime app) vers app_runtime, en gardant
--   -- DATABASE_DIRECT_URL (migrations, scripts admin) sur le rôle propriétaire.
--
-- Ce bloc n'est pas exécuté automatiquement ici (choix du mot de passe hors
-- périmètre d'un fichier versionné) — c'est une action manuelle à faire sur
-- l'environnement cible avant de considérer la RLS comme réellement active.
-- =============================================================================
