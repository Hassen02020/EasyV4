-- R4-03 (audit Phase 0) : wallet_ledger append-only.
--
-- settleCommissions() faisait un UPDATE sur wallet_ledger (settled_at,
-- settlement_id) pour marquer les lignes de commission comme réglées —
-- violation littérale de l'invariant "ledger append-only" (Master Prompt
-- §13.2). Cette table remplace ce marquage par un enregistrement séparé,
-- append-only : une ligne = "cette entrée de ledger a été incluse dans ce
-- settlement". Les colonnes wallet_ledger.settled_at/settlement_id restent
-- en place (jamais supprimées, jamais réécrites après ce backfill unique).

CREATE TABLE IF NOT EXISTS commission_settlement_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_ledger_id uuid NOT NULL,
  settlement_id uuid NOT NULL,
  settled_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS commission_settlement_entries_ledger_uniq
  ON commission_settlement_entries (wallet_ledger_id);

CREATE INDEX IF NOT EXISTS commission_settlement_entries_settlement_idx
  ON commission_settlement_entries (settlement_id);

-- Backfill unique depuis les colonnes existantes (jamais réexécuté).
INSERT INTO commission_settlement_entries (wallet_ledger_id, settlement_id, settled_at)
SELECT id, settlement_id, settled_at
FROM wallet_ledger
WHERE settled_at IS NOT NULL
  AND settlement_id IS NOT NULL
ON CONFLICT (wallet_ledger_id) DO NOTHING;
