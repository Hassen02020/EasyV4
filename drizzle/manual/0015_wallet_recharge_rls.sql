-- =============================================================================
-- Easy2Book — RLS pour wallet_recharge_requests (gap trouvé en audit)
-- =============================================================================
-- PROBLÈME : `wallet_recharge_requests` (créée dans 0004_wallet_recharge.sql,
-- porte `agency_id`, contient des URLs de justificatif de paiement et des
-- montants de recharge) n'a JAMAIS reçu de policy RLS — absente de 0001,
-- 0005, 0006, 0010, 0011, et donc absente de la liste FORCE ROW LEVEL
-- SECURITY de 0012. Combinée au `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL
-- TABLES IN SCHEMA public TO authenticated` de 0001, n'importe quel
-- utilisateur authentifié qui interroge cette table directement (hors du
-- Server Action `lib/finance/recharge-actions.ts`, qui lui scope
-- correctement via `withTenantContext`) voit et modifie les demandes de
-- recharge de TOUTES les agences — montants, méthode de paiement, URL du
-- justificatif inclus.
--
-- Suit exactement le pattern `current_agency_id() OR is_super_admin()`
-- introduit dans 0012_rls_session_context.sql — pas l'ancien pattern
-- `auth.uid()` de 0006 (inerte en connexion directe postgres-js).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0015_wallet_recharge_rls.sql
--
-- Dépend de : 0004 (table), 0012 (current_agency_id()/is_super_admin()).
-- Idempotent : peut être réexécuté sans effet de bord.
-- =============================================================================

BEGIN;

ALTER TABLE wallet_recharge_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_recharge_requests_tenant_isolation" ON wallet_recharge_requests;
CREATE POLICY "wallet_recharge_requests_tenant_isolation" ON wallet_recharge_requests
  FOR ALL
  USING (agency_id = current_agency_id() OR is_super_admin())
  WITH CHECK (agency_id = current_agency_id() OR is_super_admin());

-- Comme les 48 tables de 0012 §4 : sans FORCE, le propriétaire de la table
-- (rôle des migrations, très probablement celui de DATABASE_URL) est exempté
-- de RLS par défaut.
ALTER TABLE wallet_recharge_requests FORCE ROW LEVEL SECURITY;

COMMIT;
