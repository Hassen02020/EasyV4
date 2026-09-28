-- =============================================================================
-- Easy2Book — Commission Wallet + Settlement (Chantier 37B + 37C)
-- =============================================================================
-- Contexte : `reservation_financials.commission_amount` est désormais renseigné
-- (Chantier 37A, commit 5ffd6b5) mais aucun wallet ne centralise ces montants.
-- Cette migration :
--
--  1. Relaxe `wallet_accounts_owner_check` pour autoriser un compte "platform"
--     (agency_id IS NULL, customer_id IS NULL) lorsque type = 'commission'.
--     Sans ce changement, le CHECK interdit tout compte non attaché à un owner.
--
--  2. Seed le compte commission Easy2Book (UUID bien connu, idempotent).
--     Ce compte est la destination de tous les crédits de commission —
--     son solde représente les commissions cumulées non encore settlées.
--
--  3. Crée `credit_platform_commission()` (SECURITY DEFINER) — appelée depuis
--     le pipeline de réservation (withTenantContext, agence) sans avoir besoin
--     d'élever le contexte RLS de la transaction principale. Atomique :
--     UPDATE balance + INSERT ledger dans le même appel.
--
--  4. Crée `commission_settlements` — table de regroupement des settlements
--     périodiques (Easy2Book → bilan interne ou virement réel).
--
--  5. Ajoute `settled_at` et `settlement_id` à `wallet_ledger` pour relier
--     chaque entrée commission à son settlement et éviter les doublons.
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0066_commission_wallet_settlement.sql
--
-- Idempotent (IF NOT EXISTS / OR REPLACE / ON CONFLICT).
-- =============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Relaxer wallet_accounts_owner_check
-- ──────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_accounts_owner_check'
  ) THEN
    ALTER TABLE wallet_accounts DROP CONSTRAINT wallet_accounts_owner_check;
  END IF;
END $$;

ALTER TABLE wallet_accounts ADD CONSTRAINT wallet_accounts_owner_check CHECK (
  (agency_id IS NOT NULL AND customer_id IS NULL)
  OR (agency_id IS NULL AND customer_id IS NOT NULL)
  OR (type = 'commission' AND agency_id IS NULL AND customer_id IS NULL)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Seed du compte commission platform Easy2Book
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO wallet_accounts (id, type, name, description, currency, current_balance, is_active)
VALUES (
  '00000000-e2b0-0000-0000-000000000001',
  'commission',
  'Easy2Book Commission',
  'Compte centralisé des commissions Easy2Book prélevées sur les marges agences. Soldé périodiquement via commission_settlements.',
  'TND',
  0,
  true
) ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. credit_platform_commission() — SECURITY DEFINER
-- ──────────────────────────────────────────────────────────────────────────────
-- Appelée depuis le pipeline booking (contexte tenant) pour créditer le compte
-- commission platform sans nécessiter is_super_admin dans la transaction.
-- Le verrou SELECT … FOR UPDATE garantit l'exactitude de balanceBefore/After
-- même sous charge concurrente (plusieurs réservations simultanées).
CREATE OR REPLACE FUNCTION credit_platform_commission(
  p_wallet_id   uuid,
  p_reservation_id uuid,
  p_amount      numeric,
  p_description text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_before numeric;
  v_balance_after  numeric;
BEGIN
  -- Verrou exclusif sur le compte platform
  SELECT current_balance INTO v_balance_before
  FROM wallet_accounts WHERE id = p_wallet_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMISSION_WALLET_NOT_FOUND: %', p_wallet_id
      USING ERRCODE = 'P0002';
  END IF;

  v_balance_after := v_balance_before + p_amount;

  UPDATE wallet_accounts
  SET current_balance = v_balance_after,
      updated_at      = now()
  WHERE id = p_wallet_id;

  INSERT INTO wallet_ledger (
    wallet_account_id, type, status,
    amount, balance_before, balance_after,
    reservation_id, description, category
  ) VALUES (
    p_wallet_id, 'commission', 'completed',
    p_amount, v_balance_before, v_balance_after,
    p_reservation_id, p_description, 'commission'
  );
END;
$$;

-- Supabase accorde EXECUTE à PUBLIC par défaut sur les fonctions du schéma
-- public — REVOKE explicite requis avant le GRANT ciblé.
-- authenticated / anon exclus volontairement : tout utilisateur connecté
-- pourrait appeler supabase.rpc() avec un montant arbitraire et corrompre
-- le solde platform. Seul le backend (service_role / app_runtime) peut la
-- déclencher — via le pipeline de réservation uniquement.
REVOKE ALL ON FUNCTION credit_platform_commission(uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION credit_platform_commission(uuid, uuid, numeric, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION credit_platform_commission(uuid, uuid, numeric, text)
  TO service_role, app_runtime;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. commission_settlements (37C)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_settlements (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start         date        NOT NULL,
  period_end           date        NOT NULL,
  total_amount         numeric(14, 2) NOT NULL DEFAULT 0,
  ledger_entry_count   integer     NOT NULL DEFAULT 0,
  status               varchar(20) NOT NULL DEFAULT 'pending',
  notes                text,
  settled_by           uuid,
  settled_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_settlements_status_check
    CHECK (status IN ('pending', 'paid', 'cancelled')),
  CONSTRAINT commission_settlements_amounts_positive
    CHECK (total_amount >= 0 AND ledger_entry_count >= 0)
);

-- Unicité période : empêche deux settlements pour la même plage de dates
-- (protection contre appels concurrents à settleCommissions).
CREATE UNIQUE INDEX IF NOT EXISTS commission_settlements_period_uniq
  ON commission_settlements (period_start, period_end);
CREATE INDEX IF NOT EXISTS commission_settlements_status_idx
  ON commission_settlements (status);

-- RLS : lecture/écriture super_admin uniquement
ALTER TABLE commission_settlements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commission_settlements'
      AND policyname = 'commission_settlements_superadmin'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY commission_settlements_superadmin
        ON commission_settlements
        FOR ALL
        TO authenticated
        USING (is_super_admin())
        WITH CHECK (is_super_admin())
    $policy$;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON commission_settlements TO authenticated, service_role, app_runtime;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. settled_at + settlement_id sur wallet_ledger (pour tracking 37C)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE wallet_ledger
  ADD COLUMN IF NOT EXISTS settled_at    timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_id uuid REFERENCES commission_settlements(id);

CREATE INDEX IF NOT EXISTS wallet_ledger_settlement_idx
  ON wallet_ledger (settlement_id)
  WHERE settlement_id IS NOT NULL;

COMMIT;
