-- 0151 — CANCEL-FINANCIAL-COHERENCE-01, étape 2b : les droits économiques
-- deviennent « gagnés » à la CONFIRMATION de la réservation (D-01c,
-- décision Direction T4-D2 = B, 2026-11-08).
--
-- Avant : recordReservationFinancials écrivait toujours status='earned',
-- même pour une réservation en attente de paiement — une réservation
-- expirée gardait des droits « gagnés ».
-- Après : écriture 'pending' tant que la réservation n'est pas confirmée ;
-- passage 'pending' → 'earned' par cette fonction, appelée depuis le point de
-- confirmation unique (recordReservationTransition, to = 'confirmed').
--
-- app_runtime n'a pas UPDATE sur economic_entitlements (0092) : même
-- patron SECURITY DEFINER que mark_econ_commission_settled (0093). La
-- fonction ne touche QUE les lignes d'origine 'pending' de LA réservation
-- (jamais une compensation, jamais un autre statut, jamais un montant).
--
-- Audit préalable production (lecture seule, 2026-11-08) : 3 lignes
-- economic_entitlements (TG-2026-000004, annulée, jamais confirmée) ;
-- aucune donnée modifiée par cette migration. Idempotente.
--
-- Retour arrière :
--   DROP FUNCTION IF EXISTS mark_entitlements_earned(uuid);
--   (le code appelant doit être retiré AVANT, sinon toute confirmation échoue)

BEGIN;

CREATE OR REPLACE FUNCTION mark_entitlements_earned(p_reservation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE economic_entitlements
  SET status = 'earned', effective_at = now(), updated_at = now()
  WHERE reservation_id = p_reservation_id
    AND status = 'pending'
    AND compensates_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION mark_entitlements_earned(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_entitlements_earned(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_entitlements_earned(uuid) TO service_role, app_runtime;

COMMIT;
