-- =============================================================================
-- Easy2Book — RLS pour les 4 tables Omra restantes (Phase 12, Partie 8)
-- =============================================================================
-- CONTEXTE : 0017_omra_pilgrims_rls.sql a corrigé `omra_pilgrims` et
-- documentait explicitement 4 tables Omra restées sans RLS dans son
-- commentaire de portée : `omra_packages`, `omra_allotments`, `omra_flights`,
-- `omra_room_allocations`. Ce fichier les corrige toutes les 4, sans
-- réouvrir ni modifier 0017.
--
-- `omra_hotels` reste volontairement HORS PÉRIMÈTRE : c'est un référentiel
-- global (hôtels La Mecque/Médine) sans colonne `agency_id` — data partagée
-- entre toutes les agences par construction, pas une donnée tenant. Aucune
-- isolation à appliquer.
--
-- MODÈLE DE DONNÉES (public catalogue vs privé réservation) :
--   - `omra_packages`   : catalogue produit (nom, prix, inclusions) —
--     équivalent Omra de `catalog_packages` (déjà protégée par
--     `agency_id = current_agency_id() OR is_super_admin()` depuis 0001, et
--     déjà exposée au storefront public via `withSystemContext()` — même
--     bypass super_admin, PAS de policy anon distincte, pas un nouveau
--     concept). Porte `agency_id` directement.
--   - `omra_allotments` : disponibilités par date/package — pas de colonne
--     `agency_id` directe, seulement `package_id`. Isolation via sous-requête
--     sur `omra_packages.agency_id`.
--   - `omra_flights` et `omra_room_allocations` : données OPÉRATIONNELLES
--     liées à une réservation confirmée (vols du groupe, répartition des
--     chambres) — pas un catalogue, pas de colonne `agency_id` directe
--     (seulement `reservation_id`/`package_id`). Isolation via sous-requête
--     sur `reservations.agency_id`. Traitées comme données privées, au même
--     niveau que `omra_pilgrims` (0017) — aucun accès public direct prévu ;
--     le storefront ne les lit jamais hors contexte tenant/système.
--
-- Suit exactement le pattern `current_agency_id() OR is_super_admin()`
-- introduit dans 0012_rls_session_context.sql et réutilisé par 0017.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0021_omra_remaining_rls.sql
--
-- Dépend de : 0006 (omra_module), 0012 (current_agency_id()/is_super_admin()),
-- 0017 (omra_pilgrims, référence de pattern).
-- Idempotent : peut être réexécuté sans effet de bord.
-- Déjà appliqué en production (projet Supabase vqhuptgjhoornteibbpj) via
-- Supabase MCP le 2026-08-21, dans le cadre de la Phase 12. Vérifié
-- post-application : relrowsecurity/relforcerowsecurity = true sur les 4
-- tables ; le rôle `app_runtime` (non-BYPASSRLS, voir 0012 §5 — existe déjà
-- sur ce projet, GRANT SELECT/INSERT/UPDATE/DELETE confirmés sur les 6
-- tables Omra) reste fonctionnel sous ces policies. NON VÉRIFIABLE depuis
-- cet environnement : que `DATABASE_URL` en production (Vercel) pointe
-- réellement vers `app_runtime` plutôt que vers `postgres` (BYPASSRLS=true
-- sur ce projet) — à confirmer par l'opérateur (voir rapport Phase 12,
-- section INFRA/BYPASSRLS).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- omra_packages — agency_id direct, même pattern que catalog_packages.
-- -----------------------------------------------------------------------------
ALTER TABLE omra_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omra_packages_tenant_isolation" ON omra_packages;
CREATE POLICY "omra_packages_tenant_isolation" ON omra_packages
  FOR ALL
  USING (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

ALTER TABLE omra_packages FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- omra_allotments — pas d'agency_id direct, isolation via omra_packages.
-- -----------------------------------------------------------------------------
ALTER TABLE omra_allotments ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE omra_allotments FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- omra_flights — données opérationnelles privées, isolation via reservations.
-- -----------------------------------------------------------------------------
ALTER TABLE omra_flights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omra_flights_tenant_isolation" ON omra_flights;
CREATE POLICY "omra_flights_tenant_isolation" ON omra_flights
  FOR ALL
  USING (
    is_super_admin()
    OR reservation_id IN (SELECT id FROM reservations WHERE agency_id = current_agency_id())
  )
  WITH CHECK (
    is_super_admin()
    OR reservation_id IN (SELECT id FROM reservations WHERE agency_id = current_agency_id())
  );

ALTER TABLE omra_flights FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- omra_room_allocations — données opérationnelles privées (chambres des
-- pèlerins), isolation via reservations, même modèle que omra_flights.
-- -----------------------------------------------------------------------------
ALTER TABLE omra_room_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omra_room_allocations_tenant_isolation" ON omra_room_allocations;
CREATE POLICY "omra_room_allocations_tenant_isolation" ON omra_room_allocations
  FOR ALL
  USING (
    is_super_admin()
    OR reservation_id IN (SELECT id FROM reservations WHERE agency_id = current_agency_id())
  )
  WITH CHECK (
    is_super_admin()
    OR reservation_id IN (SELECT id FROM reservations WHERE agency_id = current_agency_id())
  );

ALTER TABLE omra_room_allocations FORCE ROW LEVEL SECURITY;

COMMIT;

-- =============================================================================
-- VÉRIFICATION POST-APPLICATION (à exécuter manuellement) :
--
--   SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class
--   WHERE relname IN ('omra_packages', 'omra_allotments', 'omra_flights',
--                      'omra_room_allocations')
--   ORDER BY relname;
--   -- Attendu : relrowsecurity = true ET relforcerowsecurity = true pour les 4.
--
--   SELECT tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename IN ('omra_packages', 'omra_allotments', 'omra_flights',
--                        'omra_room_allocations');
-- =============================================================================
