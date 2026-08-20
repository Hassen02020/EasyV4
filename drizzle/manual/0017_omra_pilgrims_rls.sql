-- =============================================================================
-- Easy2Book — RLS pour omra_pilgrims (gap trouvé en audit wallet/paiement)
-- =============================================================================
-- PROBLÈME : `omra_pilgrims` (créée par la migration Omra initiale, porte
-- `agency_id`, et contient des données personnelles sensibles — numéro de
-- passeport, date/lieu de naissance, conditions médicales, contact
-- d'urgence) n'a jamais reçu de policy RLS — absente de FORCE ROW LEVEL
-- SECURITY de 0012. N'importe quel utilisateur authentifié interrogeant la
-- table directement (hors du Server Action lib/omra/booking-actions.ts, qui
-- lui scope correctement via withTenantContext) voit et modifie les fiches
-- pèlerins de TOUTES les agences.
--
-- Suit exactement le pattern current_agency_id() OR is_super_admin()
-- introduit dans 0012_rls_session_context.sql (identique à 0015 pour
-- wallet_recharge_requests).
--
-- Portée volontairement limitée à omra_pilgrims dans cette passe : les
-- autres tables Omra RLS-désactivées trouvées par l'audit (omra_packages,
-- omra_allotments, omra_flights, omra_room_allocations) sont potentiellement
-- des données catalogue destinées à un accès public (storefront B2C non
-- authentifié parcourant les packages Omra) — leur verrouiller l'accès à
-- current_agency_id() sans vérifier le comportement réel de la recherche
-- publique risquerait de casser le storefront en production. De plus,
-- omra_flights et omra_room_allocations n'ont pas de colonne agency_id
-- directe (seulement reservation_id/package_id) : une policy correcte y
-- nécessiterait une jointure vers reservations ou omra_packages, à
-- concevoir et vérifier séparément. Documenté comme finding résiduel dans
-- le rapport d'audit plutôt que corrigé à l'aveugle.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0017_omra_pilgrims_rls.sql
--
-- Dépend de : 0012 (current_agency_id()/is_super_admin()).
-- Idempotent : peut être réexécuté sans effet de bord.
-- Déjà appliqué en production (projet Supabase vqhuptgjhoornteibbpj) via
-- Supabase MCP le 2026-08-20, dans le cadre de cet audit.
-- =============================================================================

BEGIN;

ALTER TABLE omra_pilgrims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omra_pilgrims_tenant_isolation" ON omra_pilgrims;
CREATE POLICY "omra_pilgrims_tenant_isolation" ON omra_pilgrims
  FOR ALL
  USING (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

ALTER TABLE omra_pilgrims FORCE ROW LEVEL SECURITY;

COMMIT;
