-- =============================================================================
-- Easy2Book — SEC-RLS-02 : RLS manquante sur 14 tables de production
-- =============================================================================
-- Contexte (audit du 2026-09-29, GO explicite de Hassen sur "SEC-RLS-02") :
--
--   1. Le narratif R2-04 de ROADMAP.md affirmait que les 7 tables flight_*
--      "n'existent pas du tout en base". C'était vrai au moment de l'audit
--      Phase 0 mais plus aujourd'hui : la PR #59 (mergée, déployée en
--      production) modifie flight_bookings par ALTER TABLE — la table (et
--      les 10 autres tables flight_*) existe réellement en production,
--      confirmé par requête directe sur pg_class (crygnaichvlxavvbifqi) :
--      RLS activée mais 0 policy sur chacune des 11 tables → deny-all pour
--      tout rôle qui ne bypass pas RLS (anon/authenticated), mais aucune
--      isolation tenant réelle en base pour app_runtime/authenticated.
--
--   2. commission_settlement_entries (créée par R4-03/PR#56, il y a 2 jours)
--      n'a même pas RLS activée du tout (ERROR-level sur l'advisor Supabase,
--      pas seulement "policy manquante") — table financière (settlement de
--      commissions) exposée sans aucune protection RLS.
--
--   3. supplier_nodes / supplier_portal_users (Phase "Supplier Portal",
--      pré-existant) : même défaut que le lot Omra corrigé en 0061 (RLS
--      activée, 0 policy).
--
-- Le rôle applicatif réel de DATABASE_URL est `postgres` (rolbypassrls=true)
-- — RLS est donc inerte pour la connexion serveur actuelle (voir 0061).
-- Cette migration est un renforcement défense-en-profondeur (protège contre
-- tout accès direct anon/authenticated via PostgREST/Supabase client), pas
-- un correctif d'un bug fonctionnel observé.
--
-- Limitation documentée (hors périmètre de ce chantier, pas d'invention de
-- plomberie non demandée) : supplier_nodes/supplier_portal_users n'ont pas
-- de mécanisme de session/GUC pour un scoping "un fournisseur ne voit que
-- son propre nœud" (aucun current_supplier_node_id() n'existe dans
-- lib/db/tenant-context.ts). Faute de ce mécanisme, ces deux tables sont
-- ici scopées is_super_admin() uniquement (accès staff Easy2Book), comme le
-- reste des permissions "staff.*" de ces modules aujourd'hui. Un scoping
-- self-service par fournisseur est un futur chantier séparé si le portail
-- fournisseur doit un jour interroger la base directement en tant
-- qu'utilisateur authentifié plutôt que via server actions.
--
-- Dépend de : drizzle/manual/0001_rls_policies.sql (current_agency_id(),
-- is_super_admin()).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0076_flight_commission_supplier_rls.sql
--
-- Idempotent (DROP POLICY IF EXISTS / CREATE POLICY, ENABLE ROW LEVEL
-- SECURITY est lui-même idempotent).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tables flight_* avec agency_id direct — isolation standard
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'flight_commercial_rules',
    'flight_searches',
    'flight_price_snapshots',
    'flight_orders',
    'flight_bookings',
    'flight_supplier_configs',
    'flight_supplier_credentials'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
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
-- 2. Tables flight_* scopées via booking_id -> flight_bookings.agency_id
--    (booking_id NOT NULL, ON DELETE CASCADE sur toutes ces 4 tables)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'flight_booking_passengers',
    'flight_booking_segments',
    'flight_tickets',
    'flight_ancillaries'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('
      DROP POLICY IF EXISTS "%1$s_tenant_isolation" ON %1$I;
      CREATE POLICY "%1$s_tenant_isolation" ON %1$I
        FOR ALL
        USING (
          is_super_admin() OR EXISTS (
            SELECT 1 FROM flight_bookings fb
            WHERE fb.id = %1$I.booking_id
              AND fb.agency_id = current_agency_id()
          )
        )
        WITH CHECK (
          is_super_admin() OR EXISTS (
            SELECT 1 FROM flight_bookings fb
            WHERE fb.id = %1$I.booking_id
              AND fb.agency_id = current_agency_id()
          )
        );
    ', t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. flight_supplier_transactions — booking_id NULLABLE (ON DELETE SET NULL) :
--    une transaction fournisseur peut survivre à la suppression de son
--    booking. Deny-all pour une ligne orpheline (booking_id NULL) hors
--    super_admin, plutôt qu'un accès non scopé.
-- -----------------------------------------------------------------------------
ALTER TABLE flight_supplier_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flight_supplier_transactions_tenant_isolation" ON flight_supplier_transactions;
CREATE POLICY "flight_supplier_transactions_tenant_isolation" ON flight_supplier_transactions
  FOR ALL
  USING (
    is_super_admin() OR (
      booking_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM flight_bookings fb
        WHERE fb.id = flight_supplier_transactions.booking_id
          AND fb.agency_id = current_agency_id()
      )
    )
  )
  WITH CHECK (
    is_super_admin() OR (
      booking_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM flight_bookings fb
        WHERE fb.id = flight_supplier_transactions.booking_id
          AND fb.agency_id = current_agency_id()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 4. commission_settlement_entries — RLS pas même activée (ERROR advisor).
--    Pas de agency_id (le compte commission est plateforme, agency_id NULL
--    sur wallet_accounts) : même scoping que sa table sœur
--    commission_settlements (0066) — super_admin uniquement.
-- -----------------------------------------------------------------------------
ALTER TABLE commission_settlement_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commission_settlement_entries_superadmin" ON commission_settlement_entries;
CREATE POLICY "commission_settlement_entries_superadmin" ON commission_settlement_entries
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- -----------------------------------------------------------------------------
-- 5. supplier_nodes / supplier_portal_users — RLS activée, 0 policy.
--    Pas de agency_id (réseau fournisseurs, pas tenant B2B) ni de mécanisme
--    de session pour un scoping self-service par fournisseur (voir note en
--    tête de fichier) : super_admin uniquement pour l'instant.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "supplier_nodes_superadmin" ON supplier_nodes;
CREATE POLICY "supplier_nodes_superadmin" ON supplier_nodes
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "supplier_portal_users_superadmin" ON supplier_portal_users;
CREATE POLICY "supplier_portal_users_superadmin" ON supplier_portal_users
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

COMMIT;
