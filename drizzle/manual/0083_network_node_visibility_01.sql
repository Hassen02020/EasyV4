-- =============================================================================
-- NETWORK-NODE-VISIBILITY-01 (2026-09-30)
--
-- Bug trouvé pendant VERIFY-RUNTIME-ROLE-01 (audit commercial 01) :
--   - le runtime de production tourne sous `app_runtime` (rolbypassrls=false,
--     prouvé par pg_stat_statements : 214 060 appels) — la RLS est donc
--     réellement appliquée ;
--   - `supplier_nodes` n'a qu'une policy `is_super_admin()` (0076) ;
--   - `createNetworkProductBooking` (lib/network/product-booking-actions.ts)
--     lisait `supplier_nodes` dans le contexte tenant de l'agence revendeuse
--     pour vérifier `onboarding_status` → 0 ligne visible → échec
--     systématique « Le nœud fournisseur de ce produit n'est pas actif »
--     pour toute agence non super_admin. Latent : 0 produit / 0 nœud en prod.
--
-- Correctif (même pattern que lock_agency_for_debit / credit_platform_commission) :
--   une fonction SECURITY DEFINER qui ne révèle QU'UN booléen, et seulement
--   pour un produit que l'appelant a déjà le droit de voir (mêmes conditions
--   que la policy `products_tenant_isolation` de 0080). `supplier_nodes`
--   reste super_admin-only : aucune donnée de nœud n'est exposée aux agences.
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0083_network_node_visibility_01.sql
-- Idempotent (CREATE OR REPLACE). Retour arrière : DROP FUNCTION ci-dessous.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION network_product_node_is_active(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM products p
    JOIN supplier_nodes n ON n.id = p.supplier_node_id
    WHERE p.id = p_product_id
      AND n.onboarding_status = 'active'
      AND (
        is_super_admin()
        OR p.agency_id = current_agency_id()
        OR EXISTS (
          SELECT 1
          FROM product_authorizations pa
          WHERE pa.product_type = 'network'
            AND pa.product_id = p.id
            AND pa.agency_id = current_agency_id()
            AND pa.is_active = true
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION network_product_node_is_active(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION network_product_node_is_active(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION network_product_node_is_active(uuid) TO service_role, app_runtime;

COMMIT;

-- Retour arrière :
--   DROP FUNCTION IF EXISTS network_product_node_is_active(uuid);
