-- =============================================================================
-- SETTLE-02 (2026-10-04) — Intégrité référentielle settlement
--
-- GAP identifié lors de l'audit ownership SETTLEMENT :
--   `commission_settlement_entries.settlement_id` était NOT NULL mais sans FK
--   vers `commission_settlements.id`. Une entrée pouvait pointer vers un
--   settlement fantôme (ghost settlement silencieux).
--
-- Correction :
--   Ajout de FOREIGN KEY (settlement_id) → commission_settlements(id)
--   ON DELETE RESTRICT — empêche la suppression d'un settlement tant que des
--   entrées y sont rattachées (preuve de chaîne wallet_ledger → entry → settlement
--   désormais DB-enforced).
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0104_settle_fk_integrity.sql
-- Idempotent (IF NOT EXISTS). Retour arrière en bas de fichier.
-- =============================================================================

BEGIN;

ALTER TABLE commission_settlement_entries
  ADD CONSTRAINT IF NOT EXISTS commission_settlement_entries_settlement_fk
  FOREIGN KEY (settlement_id)
  REFERENCES commission_settlements(id)
  ON DELETE RESTRICT;

COMMIT;

-- Retour arrière :
--   ALTER TABLE commission_settlement_entries
--     DROP CONSTRAINT IF EXISTS commission_settlement_entries_settlement_fk;
