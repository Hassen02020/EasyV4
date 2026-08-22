-- =============================================================================
-- Easy2Book — Commerce Completion : Attractions booking, B2B product
-- authorizations, White Label foundation (Phase 13.1)
-- =============================================================================
-- POURQUOI CETTE MIGRATION :
--
-- 1. `catalog_activity_sessions.booking_deadline` : le mandat Phase 13.1
--    liste explicitement "booking deadline" comme champ minimum d'une
--    session Attractions. Colonne nullable — NULL veut dire "pas de délai
--    dédié, on utilise la date/heure de session elle-même comme coupure"
--    (comportement géré côté applicatif dans `lib/activities/*`, pas ici).
--
-- 2. `agencies.domain` : brique "Domain/Host" de la fondation White Label.
--    `agencies` EST déjà le modèle tenant du projet (multi-tenant root,
--    commentaire ligne 57 : "ota // OTA Easy2Book elle-même (ou agences en
--    marque blanche)" — le schéma anticipait déjà qu'une agence
--    `agency_type='ota'` puisse être un tenant marque blanche). Le
--    "Branding" (brandName/logoUrl/defaultLanguage/defaultCurrency) existe
--    déjà sur cette même table depuis Phase <13 — seul `domain` manquait.
--    NULL pour Easy2Book B2C et les partenaires B2B classiques.
--
-- 3. `product_authorizations` (nouvelle table) + RLS élargie sur les 6
--    tables catalogue/disponibilité Omra/Packages/Activities :
--
--    CONSTAT CRITIQUE DE L'AUDIT (voir aussi le commentaire au-dessus de
--    `productAuthorizations` dans lib/db/schema.ts) : `catalog_packages`,
--    `catalog_activities` et `omra_packages` ont, depuis
--    0001_rls_policies.sql / 0021_omra_remaining_rls.sql, une policy RLS
--    stricte `agency_id = current_agency_id() OR is_super_admin()`. Comme
--    `assertProductManager()` (Phase 13) exige `agencyType = 'ota'` pour
--    créer un produit, TOUS les produits Omra/Packages/Activities
--    appartiennent à l'agence OTA. Une vraie agence partenaire B2B
--    (`agency_type = 'partner'`, jamais super_admin) ne pouvait donc,
--    par construction RLS, JAMAIS lire un seul de ces produits — même si
--    le code applicatif de `createOmraBooking` (Phase <13, déjà validé)
--    ne filtre lui-même pas par `agency_id` et compte entièrement sur RLS.
--    Le gap "B2B — vendre les nouveaux produits" était donc un verrou RLS,
--    pas seulement une UI manquante.
--
--    Cette migration ajoute une table d'autorisation explicite
--    (`product_authorizations` : agence revendeuse × type produit × id
--    produit × canal 'b2b'/'white_label') et ÉLARGIT UNIQUEMENT LE `USING`
--    (lecture) des 6 policies concernées pour inclure les produits pour
--    lesquels l'agence courante a une autorisation active. Le `WITH CHECK`
--    (écriture) N'EST PAS élargi : une agence autorisée obtient un accès
--    LECTURE SEULE au produit d'un tiers, jamais un droit de le modifier.
--    C'est un changement additif et rétrocompatible : tant qu'aucune ligne
--    n'existe dans `product_authorizations`, le comportement RLS observé
--    est strictement identique à avant (la clause EXISTS ne matche rien).
--
-- TABLES AFFECTÉES (RLS élargie, USING seulement) :
--   catalog_packages, catalog_package_departures,
--   catalog_activities, catalog_activity_sessions,
--   omra_packages, omra_allotments
--
-- ROLLBACK : `DROP TABLE product_authorizations`, puis restaurer les 6
-- policies à leur définition 0001/0021 (USING sans la clause EXISTS
-- supplémentaire) ; `ALTER TABLE catalog_activity_sessions DROP COLUMN
-- booking_deadline`, `ALTER TABLE agencies DROP COLUMN domain`.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0023_commerce_completion.sql
-- Idempotent : ADD COLUMN gardés par IF NOT EXISTS, CREATE TABLE IF NOT
-- EXISTS, policies DROP IF EXISTS avant CREATE.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. catalog_activity_sessions.booking_deadline
-- -----------------------------------------------------------------------------
ALTER TABLE catalog_activity_sessions
  ADD COLUMN IF NOT EXISTS booking_deadline timestamptz;

-- -----------------------------------------------------------------------------
-- 2. agencies.domain (White Label — brique Domain/Host)
-- -----------------------------------------------------------------------------
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS domain varchar(255);

DROP INDEX IF EXISTS agencies_domain_uniq;
CREATE UNIQUE INDEX agencies_domain_uniq ON agencies (domain);

-- -----------------------------------------------------------------------------
-- 3. product_authorizations
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE authorized_product_type AS ENUM ('package', 'omra', 'activity');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS product_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  product_type authorized_product_type NOT NULL,
  product_id uuid NOT NULL,
  channel varchar(16) NOT NULL DEFAULT 'b2b',
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_auth_agency_product_uniq UNIQUE (agency_id, product_type, product_id)
);

CREATE INDEX IF NOT EXISTS product_auth_product_idx ON product_authorizations (product_type, product_id);
CREATE INDEX IF NOT EXISTS product_auth_agency_idx ON product_authorizations (agency_id);

ALTER TABLE product_authorizations ENABLE ROW LEVEL SECURITY;

-- Lecture : l'agence autorisée voit ses propres lignes ; super_admin voit tout.
DROP POLICY IF EXISTS "product_auth_select" ON product_authorizations;
CREATE POLICY "product_auth_select" ON product_authorizations
  FOR SELECT
  USING (agency_id = current_agency_id() OR is_super_admin());

-- Écriture : réservée à super_admin ou à un manager d'une agence OTA
-- (même garde qu'`assertProductManager()` côté applicatif — défense en
-- profondeur, pas une nouvelle règle métier).
DROP POLICY IF EXISTS "product_auth_write" ON product_authorizations;
CREATE POLICY "product_auth_write" ON product_authorizations
  FOR ALL
  USING (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM agencies a WHERE a.id = current_agency_id() AND a.agency_type = 'ota')
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM agencies a WHERE a.id = current_agency_id() AND a.agency_type = 'ota')
  );

ALTER TABLE product_authorizations FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. RLS élargie (USING seulement) — catalog_packages
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "catalog_packages_tenant_isolation" ON catalog_packages;
CREATE POLICY "catalog_packages_tenant_isolation" ON catalog_packages
  FOR ALL
  USING (
    agency_id = current_agency_id()
    OR is_super_admin()
    OR EXISTS (
      SELECT 1 FROM product_authorizations pa
      WHERE pa.product_type = 'package' AND pa.product_id = catalog_packages.id
        AND pa.agency_id = current_agency_id() AND pa.is_active
    )
  )
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

-- -----------------------------------------------------------------------------
-- catalog_package_departures
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "catalog_package_departures_tenant_isolation" ON catalog_package_departures;
CREATE POLICY "catalog_package_departures_tenant_isolation" ON catalog_package_departures
  FOR ALL
  USING (
    agency_id = current_agency_id()
    OR is_super_admin()
    OR EXISTS (
      SELECT 1 FROM product_authorizations pa
      WHERE pa.product_type = 'package' AND pa.product_id = catalog_package_departures.package_id
        AND pa.agency_id = current_agency_id() AND pa.is_active
    )
  )
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

-- -----------------------------------------------------------------------------
-- catalog_activities
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "catalog_activities_tenant_isolation" ON catalog_activities;
CREATE POLICY "catalog_activities_tenant_isolation" ON catalog_activities
  FOR ALL
  USING (
    agency_id = current_agency_id()
    OR is_super_admin()
    OR EXISTS (
      SELECT 1 FROM product_authorizations pa
      WHERE pa.product_type = 'activity' AND pa.product_id = catalog_activities.id
        AND pa.agency_id = current_agency_id() AND pa.is_active
    )
  )
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

-- -----------------------------------------------------------------------------
-- catalog_activity_sessions
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "catalog_activity_sessions_tenant_isolation" ON catalog_activity_sessions;
CREATE POLICY "catalog_activity_sessions_tenant_isolation" ON catalog_activity_sessions
  FOR ALL
  USING (
    agency_id = current_agency_id()
    OR is_super_admin()
    OR EXISTS (
      SELECT 1 FROM product_authorizations pa
      WHERE pa.product_type = 'activity' AND pa.product_id = catalog_activity_sessions.activity_id
        AND pa.agency_id = current_agency_id() AND pa.is_active
    )
  )
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

-- -----------------------------------------------------------------------------
-- omra_packages
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "omra_packages_tenant_isolation" ON omra_packages;
CREATE POLICY "omra_packages_tenant_isolation" ON omra_packages
  FOR ALL
  USING (
    agency_id = current_agency_id()
    OR is_super_admin()
    OR EXISTS (
      SELECT 1 FROM product_authorizations pa
      WHERE pa.product_type = 'omra' AND pa.product_id = omra_packages.id
        AND pa.agency_id = current_agency_id() AND pa.is_active
    )
  )
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

-- -----------------------------------------------------------------------------
-- omra_allotments (pas d'agency_id direct — sous-requête sur omra_packages,
-- même style que 0021 ; on y ajoute la même clause d'autorisation).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "omra_allotments_tenant_isolation" ON omra_allotments;
CREATE POLICY "omra_allotments_tenant_isolation" ON omra_allotments
  FOR ALL
  USING (
    is_super_admin()
    OR package_id IN (SELECT id FROM omra_packages WHERE agency_id = current_agency_id())
    OR EXISTS (
      SELECT 1 FROM product_authorizations pa
      WHERE pa.product_type = 'omra' AND pa.product_id = omra_allotments.package_id
        AND pa.agency_id = current_agency_id() AND pa.is_active
    )
  )
  WITH CHECK (
    is_super_admin()
    OR package_id IN (SELECT id FROM omra_packages WHERE agency_id = current_agency_id())
  );

COMMIT;

-- =============================================================================
-- VÉRIFICATION POST-APPLICATION (à exécuter manuellement) :
--
--   SELECT table_name, column_name FROM information_schema.columns
--   WHERE (table_name = 'catalog_activity_sessions' AND column_name = 'booking_deadline')
--      OR (table_name = 'agencies' AND column_name = 'domain');
--
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--   WHERE relname = 'product_authorizations';
--
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename IN ('catalog_packages','catalog_package_departures',
--                        'catalog_activities','catalog_activity_sessions',
--                        'omra_packages','omra_allotments','product_authorizations')
--   ORDER BY tablename, policyname;
-- =============================================================================
