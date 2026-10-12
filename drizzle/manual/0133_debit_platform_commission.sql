-- =============================================================================
-- Easy2Book — debit_platform_commission() (CANCEL-COMMISSION-01)
-- =============================================================================
-- Symétrique de credit_platform_commission() (migration 0066) :
-- débite le solde réel du wallet commission Easy2Book lors d'une annulation.
--
-- Ordre des opérations (verrou AVANT idempotence) :
--   1. SELECT FOR UPDATE sur wallet_accounts → sérialise les appels concurrents.
--   2. Idempotency guard (après verrou) → un second appel concurrent voit la
--      clé déjà insérée par le premier et retourne silencieusement.
--   3. Garde solde négatif → rejette tout débit qui ferait passer current_balance
--      sous zéro (indique une erreur amont ou une commission non collectée).
--   4. UPDATE wallet_accounts + INSERT wallet_ledger.
--
-- Architecture identique à credit_platform_commission() :
--   SELECT … FOR UPDATE  → garantit cohérence balance_before/after sous charge
--   UPDATE wallet_accounts → solde réel, jamais shadow
--   INSERT wallet_ledger   → écriture compensatoire, type='adjustment', category='fee'
--
-- Idempotence : p_idempotency_key unique dans wallet_ledger (index
-- wallet_ledger_idempotency_uniq, migration 0084). Un double-appel
-- (double-clic, retry) ne débite jamais deux fois — silencieusement.
--
-- GUARD COMMERCIAL : cette fonction ne décide PAS de la politique d'annulation
-- (full_reversal / pro_rata_fee / non_refundable). L'appelant TypeScript
-- (lib/finance/commission-reversal.ts) reçoit le montant calculé selon la
-- politique — cette fonction ne reçoit que le montant final à débiter.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0133_debit_platform_commission.sql
-- Idempotent (CREATE OR REPLACE, re-exécutable sans danger).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION debit_platform_commission(
  p_wallet_id       uuid,
  p_reservation_id  uuid,
  p_amount          numeric,
  p_description     text,
  p_idempotency_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_before numeric;
  v_balance_after  numeric;
BEGIN
  -- Verrou exclusif en premier : sérialise les appels concurrents sur ce wallet.
  -- L'idempotency guard doit être APRÈS le verrou pour éviter la race où deux
  -- appels passent tous deux le EXISTS check avant que l'un committe l'INSERT.
  SELECT current_balance INTO v_balance_before
  FROM wallet_accounts WHERE id = p_wallet_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMISSION_WALLET_NOT_FOUND: %', p_wallet_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency guard après verrou : le second appel concurrent voit ici la
  -- clé déjà committée par le premier.
  IF EXISTS (
    SELECT 1 FROM wallet_ledger
    WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN;
  END IF;

  -- Garde solde négatif : un reversement de commission ne peut pas excéder
  -- les commissions collectées. Solde négatif = erreur amont à investiguer.
  v_balance_after := v_balance_before - p_amount;
  IF v_balance_after < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_COMMISSION_BALANCE: balance=% amount=%',
      v_balance_before, p_amount
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE wallet_accounts
  SET current_balance = v_balance_after,
      updated_at      = now()
  WHERE id = p_wallet_id;

  -- amount négatif dans le ledger : convention d'un flux sortant
  INSERT INTO wallet_ledger (
    wallet_account_id, type, status,
    amount, balance_before, balance_after,
    reservation_id, description, category, idempotency_key
  ) VALUES (
    p_wallet_id, 'adjustment', 'completed',
    -p_amount, v_balance_before, v_balance_after,
    p_reservation_id, p_description, 'fee', p_idempotency_key
  );
END;
$$;

-- Mêmes règles d'accès que credit_platform_commission() :
-- PUBLIC/anon/authenticated exclus — seul le backend (service_role / app_runtime)
-- peut déclencher un débit de commission.
REVOKE ALL ON FUNCTION debit_platform_commission(uuid, uuid, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION debit_platform_commission(uuid, uuid, numeric, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION debit_platform_commission(uuid, uuid, numeric, text, text)
  TO service_role, app_runtime;

COMMIT;
