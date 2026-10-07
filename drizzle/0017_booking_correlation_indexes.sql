-- IDENTITY-J2A-01 : renforcement des contrats d'identité Booking → Financial
--
-- Deux corrections :
--
-- 1. Index partiel sur partner_credit_movements.reservation_id
--    Permet de retrouver instantanément tous les mouvements wallet d'une
--    réservation (débit à la réservation, remboursement éventuel) sans full
--    scan. L'index est partiel (WHERE IS NOT NULL) : les mouvements de
--    recharge / ajustement sans réservation associée ne l'encombrent pas.
--    CONCURRENTLY : aucun verrou sur la table en production.
--
-- 2. FK commission_settlement_entries.wallet_ledger_id → wallet_ledger.id
--    Garantit au niveau DB qu'une entrée de settlement ne peut pas référencer
--    un enregistrement ledger inexistant. Conforme à la règle R4-03
--    (wallet_ledger append-only) : la FK empêche toute suppression d'une
--    ligne ledger déjà settlée, ce qui est exactement l'invariant voulu.

CREATE INDEX CONCURRENTLY IF NOT EXISTS partner_credit_reservation_idx
  ON partner_credit_movements (reservation_id)
  WHERE reservation_id IS NOT NULL;

ALTER TABLE commission_settlement_entries
  ADD CONSTRAINT commission_settlement_entries_wallet_ledger_fk
  FOREIGN KEY (wallet_ledger_id)
  REFERENCES wallet_ledger(id)
  ON DELETE RESTRICT;
