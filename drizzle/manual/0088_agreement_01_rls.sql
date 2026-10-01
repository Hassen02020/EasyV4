-- AGREEMENT-01 — RLS sur commercial_agreements (créée par 0087).
--
-- [D-01a] (Direction, 2026-09-30) : "une agence ne peut jamais modifier la
-- part d'Easy2Book". Contrairement à la quasi-totalité des tables
-- multi-tenant de ce dépôt (qui suivent `agency_id = current_agency_id() OR
-- is_super_admin()` pour TOUTES les commandes, cf. `margin_rules` elle-même
-- et son policy `margin_rules_tenant_isolation`), il n'existe ICI AUCUN cas
-- "une agence peut écrire ses propres lignes" — l'écriture (INSERT/UPDATE/
-- DELETE) est réservée à `is_super_admin()` SANS EXCEPTION, appliqué au
-- niveau `FOR ALL`. Une politique `FOR SELECT` séparée, plus large,
-- s'ajoute par-dessus (policies permissives multiples = OR logique sur la
-- même commande) : une agence peut LIRE un accord où elle apparaît comme
-- seller/owner/supplier/collector, mais ne peut jamais passer par cette
-- policy pour écrire (elle ne couvre que SELECT).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0088_agreement_01_rls.sql
--
-- Idempotent (DROP POLICY IF EXISTS / CREATE POLICY ; ENABLE/FORCE ROW LEVEL
-- SECURITY sont eux-mêmes idempotents). Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

ALTER TABLE commercial_agreements ENABLE ROW LEVEL SECURITY;

-- Écriture (et filet de lecture par défaut) : super_admin uniquement.
DROP POLICY IF EXISTS "commercial_agreements_admin_write" ON commercial_agreements;
CREATE POLICY "commercial_agreements_admin_write" ON commercial_agreements
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Lecture élargie : une agence voit les accords où elle est partie prenante
-- (seller/owner/supplier/collector). Policy permissive supplémentaire —
-- combinée en OR avec la policy ci-dessus pour les commandes SELECT
-- uniquement ; n'élargit jamais l'écriture.
DROP POLICY IF EXISTS "commercial_agreements_party_read" ON commercial_agreements;
CREATE POLICY "commercial_agreements_party_read" ON commercial_agreements
  FOR SELECT
  USING (
    is_super_admin()
    OR (seller_party_type = 'agency' AND seller_party_id = current_agency_id())
    OR (owner_party_type = 'agency' AND owner_party_id = current_agency_id())
    OR (supplier_party_type = 'agency' AND supplier_party_id = current_agency_id())
    OR (collector_party_type = 'agency' AND collector_party_id = current_agency_id())
  );

-- FORCE ROW LEVEL SECURITY : cohérent avec 0012/0086 — s'applique aussi au
-- propriétaire de la table (jamais aux rôles superuser/BYPASSRLS).
ALTER TABLE commercial_agreements FORCE ROW LEVEL SECURITY;

COMMIT;

-- Retour arrière :
--   DROP POLICY IF EXISTS "commercial_agreements_party_read" ON commercial_agreements;
--   DROP POLICY IF EXISTS "commercial_agreements_admin_write" ON commercial_agreements;
--   ALTER TABLE commercial_agreements NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE commercial_agreements DISABLE ROW LEVEL SECURITY;
