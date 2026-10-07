-- =============================================================================
-- SETTLE-01 (2026-10-04) — mark_econ_commission_settled()
--
-- Migration 0092 (ECON-ENTITLEMENTS-INTEGRITY-01) a révoqué UPDATE/DELETE
-- sur `economic_entitlements` à tous les rôles applicatifs (app_runtime,
-- anon, authenticated, service_role). La colonne `settlement_status` /
-- `settlement_ref` est conçue pour être écrite UNIQUEMENT lors du settlement
-- de commission — seul cas où un UPDATE est justifié sur cette table.
--
-- Ce fichier crée la fonction SECURITY DEFINER `mark_econ_commission_settled`
-- qui effectue ce UPDATE restreint depuis un contexte de confiance, en
-- limitant strictement la mutation aux lignes qualification='commission',
-- party_type='easy2book', pour les reservationIds appartenant à un
-- settlement donné.
--
-- Application : psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0093_settle_econ_commission.sql
-- Idempotent (CREATE OR REPLACE). Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION mark_econ_commission_settled(
  p_reservation_ids uuid[],
  p_settlement_ref  uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE economic_entitlements
  SET
    settlement_status = 'settled',
    settlement_ref    = p_settlement_ref::text,
    updated_at        = now()
  WHERE
    reservation_id = ANY(p_reservation_ids)
    AND qualification = 'commission'
    AND party_type    = 'easy2book';
END;
$$;

-- Révoquer EXECUTE de PUBLIC (accordé par défaut par Supabase), puis n'autoriser
-- que le backend (service_role + app_runtime) — jamais anon/authenticated qui
-- pourraient appeler supabase.rpc() depuis le client.
REVOKE ALL ON FUNCTION mark_econ_commission_settled(uuid[], uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_econ_commission_settled(uuid[], uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_econ_commission_settled(uuid[], uuid)
  TO service_role, app_runtime;

COMMIT;

-- Retour arrière :
--   DROP FUNCTION IF EXISTS mark_econ_commission_settled(uuid[], uuid);
