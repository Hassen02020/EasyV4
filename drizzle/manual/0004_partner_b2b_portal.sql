-- =============================================================================
-- Easy2Book OTA — Portail B2B (PR #9)
-- =============================================================================
-- Migration manuelle :
--  1. Extension de l'enum user_role (partner_owner / partner_agent)
--  2. Nouveaux enums (agency_type, margin_type, invoice_type, payment_mode,
--     credit_movement_type)
--  3. Extension de la table agencies (champs B2B : matricule fiscale,
--     deposit_balance, etc.)
--  4. Création des tables B2B :
--     - pricing_margins
--     - partner_invoices
--     - partner_payments
--     - partner_credit_movements
--  5. Activation RLS + policies tenant-isolation sur les nouvelles tables
--
-- Application :
--   psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0004_partner_b2b_portal.sql
--
-- IMPORTANT : à exécuter APRÈS 0000 (schema initial) et 0001 (RLS de base).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Extension de l'enum user_role
-- -----------------------------------------------------------------------------
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'partner_owner';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'partner_agent';

-- -----------------------------------------------------------------------------
-- 2. Nouveaux types enum
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE agency_type AS ENUM ('ota', 'partner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE margin_type AS ENUM ('percent', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_type AS ENUM ('facture', 'avoir', 'proforma');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_mode AS ENUM (
    'transfer', 'card', 'cash', 'credit_account', 'check'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE credit_movement_type AS ENUM (
    'credit', 'debit', 'refund', 'adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 3. Extension de la table `agencies` avec champs B2B
-- -----------------------------------------------------------------------------
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS agency_type agency_type NOT NULL DEFAULT 'ota',
  ADD COLUMN IF NOT EXISTS matricule_fiscale VARCHAR(32),
  ADD COLUMN IF NOT EXISTS registre_commerce VARCHAR(64),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS fax VARCHAR(32),
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS default_language VARCHAR(4) NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS default_currency VARCHAR(3) NOT NULL DEFAULT 'TND',
  ADD COLUMN IF NOT EXISTS mask_credit BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deposit_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_low_threshold NUMERIC(14, 2) NOT NULL DEFAULT 100.00;

CREATE INDEX IF NOT EXISTS agencies_type_idx ON agencies(agency_type);

-- -----------------------------------------------------------------------------
-- 4. Nouvelles tables B2B
-- -----------------------------------------------------------------------------

-- 4.1. pricing_margins : marges configurables par agence × module
CREATE TABLE IF NOT EXISTS pricing_margins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  module        reservation_module NOT NULL,
  margin_type   margin_type NOT NULL,
  margin_value  NUMERIC(10, 2) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pricing_margins_agency_idx ON pricing_margins(agency_id);
CREATE UNIQUE INDEX IF NOT EXISTS pricing_margins_agency_module_uniq
  ON pricing_margins(agency_id, module);

-- 4.2. partner_invoices : factures B2B
CREATE TABLE IF NOT EXISTS partner_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  invoice_number  VARCHAR(32) NOT NULL,
  invoice_type    invoice_type NOT NULL DEFAULT 'facture',
  validation_date DATE,
  line_items      JSONB,
  total_ht        NUMERIC(14, 2) NOT NULL,
  total_tva       NUMERIC(14, 2) NOT NULL,
  total_ttc       NUMERIC(14, 2) NOT NULL,
  amount_paid     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status          VARCHAR(16) NOT NULL DEFAULT 'draft',
  due_date        DATE,
  pdf_url         TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_invoices_number_uniq
  ON partner_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS partner_invoices_agency_idx ON partner_invoices(agency_id);
CREATE INDEX IF NOT EXISTS partner_invoices_status_idx
  ON partner_invoices(agency_id, status);

-- 4.3. partner_payments : règlements
CREATE TABLE IF NOT EXISTS partner_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  invoice_id        UUID REFERENCES partner_invoices(id) ON DELETE SET NULL,
  payment_mode      payment_mode NOT NULL,
  due_date          DATE,
  issue_date        DATE,
  original_amount   NUMERIC(14, 2) NOT NULL,
  remaining_amount  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credit_amount     NUMERIC(14, 2),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_payments_agency_idx ON partner_payments(agency_id);
CREATE INDEX IF NOT EXISTS partner_payments_invoice_idx ON partner_payments(invoice_id);

-- 4.4. partner_credit_movements : ledger compte de dépôt
CREATE TABLE IF NOT EXISTS partner_credit_movements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  movement_type       credit_movement_type NOT NULL,
  amount              NUMERIC(14, 2) NOT NULL,
  balance_after       NUMERIC(14, 2) NOT NULL,
  reference           VARCHAR(64),
  reservation_id      UUID,
  invoice_id          UUID,
  description         TEXT,
  created_by_user_id  UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_credit_agency_idx
  ON partner_credit_movements(agency_id);
CREATE INDEX IF NOT EXISTS partner_credit_created_idx
  ON partner_credit_movements(agency_id, created_at);

-- -----------------------------------------------------------------------------
-- 5. RLS — tenant isolation cross-agence
-- -----------------------------------------------------------------------------
ALTER TABLE pricing_margins ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_credit_movements ENABLE ROW LEVEL SECURITY;

-- Policy générique reposant sur la fonction current_agency_id() définie en 0001
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'pricing_margins',
    'partner_invoices',
    'partner_payments',
    'partner_credit_movements'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "%1$s_tenant_isolation" ON %1$I;
      CREATE POLICY "%1$s_tenant_isolation" ON %1$I
        FOR ALL
        USING (agency_id = current_agency_id() OR is_super_admin())
        WITH CHECK (agency_id = current_agency_id() OR is_super_admin());
    ', t);
  END LOOP;
END $$;

COMMIT;
