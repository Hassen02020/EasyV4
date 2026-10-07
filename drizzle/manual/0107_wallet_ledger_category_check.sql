-- =============================================================================
-- WALLET-GAP-2 (2026-10-04) — CHECK constraint wallet_ledger.category
--
-- GAP identifié lors de l'audit ownership WALLET :
--   `wallet_ledger.category` était varchar(50) sans CHECK — n'importe quelle
--   valeur pouvait être insérée (convention applicative seulement).
--
-- Valeurs autorisées (exhaustives) :
--   'booking'    — débit booking client (debitCustomerWallet)
--   'recharge'   — crédit recharge wallet client (creditCustomerWallet, source=WalletRechargeMethod)
--   'refund'     — crédit remboursement (creditCustomerWallet, source='refund')
--   'commission' — crédit commission platform (credit_platform_commission SECURITY DEFINER)
--   'fee'        — frais (documenté dans le schéma, réservé pour usage futur)
--   'adjustment' — ajustement admin (creditCustomerWallet, source='adjustment')
--   NULL         — lignes historiques sans category (nullable intentionnel)
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0107_wallet_ledger_category_check.sql
-- Idempotent (DO block). Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wallet_ledger_category_check'
  ) THEN
    ALTER TABLE wallet_ledger
      ADD CONSTRAINT wallet_ledger_category_check
      CHECK (
        category IS NULL
        OR category IN ('booking','recharge','refund','commission','fee','adjustment')
      );
  END IF;
END;
$$;

COMMIT;

-- Retour arrière :
--   ALTER TABLE wallet_ledger
--     DROP CONSTRAINT IF EXISTS wallet_ledger_category_check;
