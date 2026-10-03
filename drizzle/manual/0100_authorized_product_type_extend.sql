-- =============================================================================
-- DISTRIB-EXTEND-01 : étend l'enum `authorized_product_type`
-- =============================================================================
-- Ajoute 'car' et 'transfer' à l'enum `authorized_product_type` utilisé par
-- la table `product_authorizations` (Phase 13.1).
--
-- Motivation : les modules voiture et transfert étaient déjà réservables
-- (catalog_vehicles, catalog_transfer_zones) mais une agence partenaire B2B
-- ou un tenant White Label ne pouvait pas recevoir d'autorisation explicite
-- de revente pour ces types de produits — l'enum les ignorait. Ce correctif
-- comble ce manque sans créer de nouvelle infrastructure.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0100_authorized_product_type_extend.sql
--
-- Dépend de : 0023_commerce_completion.sql (authorized_product_type créé)
-- Idempotent : ADD VALUE IF NOT EXISTS ne plante pas si la valeur existe déjà.
-- =============================================================================

BEGIN;

ALTER TYPE authorized_product_type ADD VALUE IF NOT EXISTS 'car';
ALTER TYPE authorized_product_type ADD VALUE IF NOT EXISTS 'transfer';

COMMIT;
