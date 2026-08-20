-- =============================================================================
-- Easy2Book — CHECK balance >= 0 sur les soldes agence (défense en profondeur)
-- =============================================================================
-- L'application empêche déjà un solde négatif au niveau applicatif
-- (`debitPartnerCredit` verrouille la ligne `agencies` avec FOR UPDATE et
-- refuse le débit si `deposit_balance < amountTnd` avant toute écriture —
-- voir lib/pro/booking-actions.ts). Ce fichier ajoute la même garantie au
-- niveau base de données : aucun bug applicatif futur (mauvais ordre
-- d'opérations, contournement du Server Action via un accès direct, etc.) ne
-- doit pouvoir faire passer un solde sous zéro.
--
-- `wallets.balance` (store legacy, débranché du chemin de réservation live —
-- voir lib/wallet/actions.ts) reçoit la même contrainte par cohérence, sans
-- effort supplémentaire de vérification puisque personne ne l'écrit plus en
-- production.
--
-- ⚠️ AVANT D'APPLIQUER EN PRODUCTION : vérifier qu'aucun solde négatif
-- n'existe déjà, sinon l'ALTER TABLE échoue (les deux requêtes suivantes
-- doivent renvoyer 0 ligne) :
--   SELECT id, deposit_balance FROM agencies WHERE deposit_balance < 0;
--   SELECT id, balance FROM wallets WHERE balance < 0;
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0016_wallet_balance_nonnegative.sql
--
-- Idempotent : peut être réexécuté sans effet de bord (IF NOT EXISTS via
-- pg_constraint pour éviter une erreur "constraint already exists").
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencies_deposit_balance_nonnegative'
  ) THEN
    ALTER TABLE agencies
      ADD CONSTRAINT agencies_deposit_balance_nonnegative CHECK (deposit_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallets_balance_nonnegative'
  ) THEN
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_balance_nonnegative CHECK (balance >= 0);
  END IF;
END $$;

COMMIT;
