-- =============================================================================
-- ECON-ENTITLEMENTS-INTEGRITY-01 (2026-10-01)
--
-- Même risque R-08 que LEDGER-INTEGRITY-01 (0084), appliqué à
-- `economic_entitlements` (créée par 0085, RLS par 0086).
--
-- Constat production (pg_class/has_table_privilege, vérifié avant implémentation) :
-- app_runtime, anon, authenticated et service_role avaient encore UPDATE et
-- DELETE sur economic_entitlements ; anon/authenticated/service_role avaient
-- également TRUNCATE.
--
-- Audit code (grep lib/, app/, components/) : AUCUN UPDATE/DELETE/TRUNCATE
-- applicatif sur cette table ; seule écriture = tx.insert(economicEntitlements)
-- dans lib/finance/reservation-financials.ts (13 call sites). Logique de
-- compensation future (compensates_id / cancellation_treatment) conçue
-- append-only : une annulation insère une nouvelle ligne, jamais un UPDATE.
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0092_econ_entitlements_integrity_01.sql
-- Idempotent. Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE economic_entitlements
  FROM app_runtime, anon, authenticated, service_role;

COMMIT;

-- Retour arrière :
--   GRANT UPDATE, DELETE ON TABLE economic_entitlements TO app_runtime;
--   GRANT UPDATE, DELETE, TRUNCATE ON TABLE economic_entitlements TO anon, authenticated, service_role;
