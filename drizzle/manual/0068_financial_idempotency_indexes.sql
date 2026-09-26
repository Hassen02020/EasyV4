-- =============================================================================
-- Easy2Book — Garanties DB d'idempotence financière (Chantier 56C)
-- =============================================================================
-- Contexte : le pipeline de réservation vol (fulfillFlightBooking, step 10b)
-- appelle credit_platform_commission() et debitPartnerCredit() dans une seule
-- transaction idempotente. La garde applicative principale est le check
-- `existingFin` sur `reservation_financials`, mais aucun filet DB n'existait
-- pour wallet_ledger (commissions) ni partner_credit_movements (débits wallet).
--
-- Cette migration ajoute deux index UNIQUE partiels :
--
--   1. wallet_ledger_commission_reservation_uniq
--      → empêche deux lignes commission pour la même réservation dans
--        wallet_ledger (type = 'commission'), même si la garde applicative
--        est contournée par une retry après crash partiel.
--
--   2. partner_credit_debit_reservation_uniq
--      → empêche deux mouvements de débit pour la même réservation dans
--        partner_credit_movements (movement_type = 'debit'), filet actif même
--        si Redis Upstash est absent.
--
-- Avant création : les deux blocs DO vérifient l'absence de doublons et lèvent
-- une exception si des doublons existent — la migration s'arrête sans modifier
-- aucune donnée.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0068_financial_idempotency_indexes.sql
--
-- Idempotent (IF NOT EXISTS).
-- =============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Vérification des doublons — wallet_ledger (type = 'commission')
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count
  FROM (
    SELECT reservation_id
    FROM wallet_ledger
    WHERE type = 'commission' AND reservation_id IS NOT NULL
    GROUP BY reservation_id
    HAVING count(*) > 1
  ) sub;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'MIGRATION_BLOCKED: % doublon(s) commission détecté(s) dans wallet_ledger. '
      'Corriger manuellement avant d''appliquer cette migration.',
      dup_count
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Index UNIQUE partiel — wallet_ledger commission
-- ──────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_commission_reservation_uniq
  ON wallet_ledger (reservation_id)
  WHERE type = 'commission' AND reservation_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Vérification des doublons — partner_credit_movements (movement_type = 'debit')
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count
  FROM (
    SELECT reservation_id
    FROM partner_credit_movements
    WHERE movement_type = 'debit' AND reservation_id IS NOT NULL
    GROUP BY reservation_id
    HAVING count(*) > 1
  ) sub;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'MIGRATION_BLOCKED: % doublon(s) de débit détecté(s) dans partner_credit_movements. '
      'Corriger manuellement avant d''appliquer cette migration.',
      dup_count
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Index UNIQUE partiel — partner_credit_movements débit
-- ──────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS partner_credit_debit_reservation_uniq
  ON partner_credit_movements (reservation_id)
  WHERE movement_type = 'debit' AND reservation_id IS NOT NULL;

COMMIT;
