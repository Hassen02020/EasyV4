-- 0152 — F-3 (SETTLE-PLATFORM-FEE-01) : le règlement des commissions marque
-- aussi la part Easy2Book d'un accord commercial.
--
-- Constat (audit 2026-11-08) : mark_econ_commission_settled (0093, 0105) ne
-- marquait que qualification = 'commission'. Depuis COMMERCIAL-AGREEMENT-
-- WIRING-01 (PR #334), la part Easy2Book d'un accord est écrite en
-- 'platform_fee' (avec agreement_id) et créditée au portefeuille Easy2Book
-- dans la catégorie 'commission' : settleCommissions la règle bien, mais la
-- ligne de droit restait « non réglée ». Exemple : Network 500 TND, net 400,
-- accord 2 % du net → 8 TND réglés dans le lot, 8 TND encore « dus » côté
-- droits économiques. Même oubli pour la contre-écriture d'annulation de
-- cette part (reverseCommissionOnCancellation recopie 'platform_fee', sans
-- agreement_id, compensates_id → part d'accord).
--
-- Ne doit JAMAIS être marqué : le frais bancaire de change des vols
-- (lib/vols/flight-financials.ts, 'platform_fee' négatif, sans accord) —
-- coût absorbé par Easy2Book, jamais crédité au portefeuille.
--
-- Nouveau critère (lignes Easy2Book seulement) :
--   qualification = 'commission'
--   OU (qualification = 'platform_fee' ET (agreement_id IS NOT NULL
--       OU compensates_id désigne une ligne avec agreement_id))
--
-- Audit préalable production (lecture seule, 2026-11-08) : 0 lot de
-- règlement, 0 ligne platform_fee, 0 ligne marquée, 0 accord actif — aucune
-- donnée à rattraper. Cette migration ne modifie aucune ligne : elle
-- remplace seulement la définition de la fonction (mêmes signature, droits
-- et sécurité). Idempotente.
--
-- Retour arrière : réappliquer la définition de 0105
-- (drizzle/manual/0105_econ_entitlements_settlement_fk.sql, critère
-- qualification = 'commission' AND party_type = 'easy2book').

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
  UPDATE economic_entitlements ee
  SET
    settlement_status = 'settled',
    settlement_ref    = p_settlement_ref,
    updated_at        = now()
  WHERE
    ee.reservation_id = ANY(p_reservation_ids)
    AND ee.party_type = 'easy2book'
    AND (
      ee.qualification = 'commission'
      OR (
        ee.qualification = 'platform_fee'
        AND (
          ee.agreement_id IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM economic_entitlements orig
            WHERE orig.id = ee.compensates_id
              AND orig.agreement_id IS NOT NULL
          )
        )
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION mark_econ_commission_settled(uuid[], uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_econ_commission_settled(uuid[], uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_econ_commission_settled(uuid[], uuid)
  TO service_role, app_runtime;

COMMIT;
