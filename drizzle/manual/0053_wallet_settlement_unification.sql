-- =============================================================================
-- Easy2Book — Unification "paiement = recharge wallet, réservation = débit
-- wallet" (B2C) + tolérance de réservation configurable (B2B)
-- =============================================================================
-- Contexte : jusqu'ici, seule la méthode "wallet" (Solde Easy2Book) passait
-- réellement par `wallet_accounts`/`wallet_ledger` (lib/finance/customer-wallet.ts).
-- Les autres méthodes B2C (carte/Paymee, espèces, virement, dépôt bancaire)
-- réglaient la réservation DIRECTEMENT (lib/payment/reservation-webhook-core.ts,
-- lib/finance/manual-payment-actions.ts flippaient `payments`/`reservations`
-- sans jamais toucher un wallet). Cette migration ne touche AUCUNE table de
-- règlement B2C existante (`payments` reste inchangée, même enum
-- `payment_method`) : elle prépare uniquement le terrain nécessaire côté B2B
-- (tolérance) — le reste de l'unification (chaque règlement B2C écrit
-- désormais AUSSI un couple crédit+débit dans `wallet_ledger`, via
-- `lib/finance/customer-wallet.ts::recordTargetedWalletSettlement`) est du
-- code applicatif pur, sans changement de schéma nécessaire (les colonnes
-- `wallet_ledger.category`/`metadata.paymentMethod` existent déjà).
--
-- 1. `agencies.reservation_tolerance` — nouvelle colonne, montant TND que le
--    Master Admin peut accorder à une agence pour qu'elle continue de
--    confirmer des réservations même si son `deposit_balance` devient
--    temporairement négatif (`booking_capacity = deposit_balance +
--    reservation_tolerance`). Défaut 0 : comportement actuel inchangé tant
--    qu'aucune tolérance n'est explicitement accordée.
--
-- 2. Le CHECK `agencies_deposit_balance_nonnegative` (migration 0016,
--    `deposit_balance >= 0`) est remplacé par un plancher RELATIF à la
--    tolérance (`deposit_balance >= -reservation_tolerance`) — avec
--    `reservation_tolerance = 0` par défaut, c'est exactement la même
--    contrainte qu'avant pour toute agence non explicitement configurée.
--
-- 3. `lock_agency_for_debit()` (migration 0025) renvoie maintenant aussi
--    `reservation_tolerance`, pour que `debitPartnerCredit` (lib/pro/
--    booking-actions.ts) puisse comparer `currentBalance + tolerance` au
--    montant demandé, sans requête SELECT supplémentaire.
--
-- 4. `set_agency_reservation_tolerance()` — même pattern SECURITY DEFINER que
--    `set_agency_deposit_balance()` (migration 0020) : seul canal autorisé
--    pour écrire cette colonne, Master Admin uniquement (vérifié côté
--    application par `assertSuperAdmin()` avant l'appel, comme
--    `adminRechargeWallet`).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0053_wallet_settlement_unification.sql
--
-- Dépend de : 0016 (CHECK), 0020 (set_agency_deposit_balance), 0025
-- (lock_agency_for_debit). Idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- =============================================================================

BEGIN;

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS reservation_tolerance numeric(12, 3) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencies_deposit_balance_nonnegative'
  ) THEN
    ALTER TABLE agencies DROP CONSTRAINT agencies_deposit_balance_nonnegative;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencies_deposit_balance_floor'
  ) THEN
    ALTER TABLE agencies
      ADD CONSTRAINT agencies_deposit_balance_floor
      CHECK (deposit_balance >= -reservation_tolerance);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencies_reservation_tolerance_nonnegative'
  ) THEN
    ALTER TABLE agencies
      ADD CONSTRAINT agencies_reservation_tolerance_nonnegative
      CHECK (reservation_tolerance >= 0);
  END IF;
END $$;

-- Signature de retour changée (colonne `reservation_tolerance` ajoutée) —
-- CREATE OR REPLACE seul refuse ce changement pour une fonction à colonnes
-- de sortie (OUT params), d'où le DROP explicite avant recréation.
DROP FUNCTION IF EXISTS lock_agency_for_debit(uuid);

CREATE FUNCTION lock_agency_for_debit(p_agency_id uuid)
RETURNS TABLE(id uuid, deposit_balance numeric, reservation_tolerance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (p_agency_id = current_agency_id() OR is_super_admin()) THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot lock another agency''s wallet balance'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT a.id, a.deposit_balance, a.reservation_tolerance
  FROM agencies a WHERE a.id = p_agency_id FOR UPDATE;
END;
$$;

GRANT EXECUTE ON FUNCTION lock_agency_for_debit(uuid) TO authenticated, service_role, app_runtime;

CREATE OR REPLACE FUNCTION set_agency_reservation_tolerance(
  p_agency_id uuid,
  p_tolerance numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: only super_admin can set an agency reservation tolerance'
      USING ERRCODE = '42501';
  END IF;

  IF p_tolerance < 0 THEN
    RAISE EXCEPTION 'INVALID_TOLERANCE: must be >= 0' USING ERRCODE = '22023';
  END IF;

  UPDATE agencies
  SET reservation_tolerance = p_tolerance, updated_at = now()
  WHERE id = p_agency_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGENCY_NOT_FOUND: %', p_agency_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION set_agency_reservation_tolerance(uuid, numeric)
  TO authenticated, service_role, app_runtime;

COMMIT;
