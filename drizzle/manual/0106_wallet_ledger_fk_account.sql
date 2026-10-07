-- =============================================================================
-- WALLET-GAP-1 (2026-10-04) — FK DB wallet_ledger.wallet_account_id
--                              → wallet_accounts(id)
--
-- GAP identifié lors de l'audit ownership WALLET :
--   `wallet_ledger.wallet_account_id` était NOT NULL mais sans FK.
--   Un mouvement pouvait référencer un compte wallet inexistant (silent orphan).
--
-- Correction :
--   ADD FOREIGN KEY (wallet_account_id) → wallet_accounts(id)
--   ON DELETE RESTRICT — empêche la suppression d'un compte tant que des
--   mouvements y sont rattachés.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0106_wallet_ledger_fk_account.sql
-- Idempotent (DO block). Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wallet_ledger_wallet_account_id_fk'
  ) THEN
    ALTER TABLE wallet_ledger
      ADD CONSTRAINT wallet_ledger_wallet_account_id_fk
      FOREIGN KEY (wallet_account_id)
      REFERENCES wallet_accounts(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

COMMIT;

-- Retour arrière :
--   ALTER TABLE wallet_ledger
--     DROP CONSTRAINT IF EXISTS wallet_ledger_wallet_account_id_fk;
