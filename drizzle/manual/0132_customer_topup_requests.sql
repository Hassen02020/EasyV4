-- Migration 0132 — customer_topup_requests
-- Demandes de recharge wallet B2C client via PSP (Paymee)
-- Append-only : wallet_ledger n'est jamais UPDATE (invariant permanent)
-- payment_reference = id de la demande envoyé comme order_id à Paymee

CREATE TABLE IF NOT EXISTS customer_topup_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID        NOT NULL REFERENCES customers(id),
  agency_id         UUID        NOT NULL REFERENCES agencies(id),
  amount            NUMERIC(14,2) NOT NULL CHECK (amount >= 1.00),
  status            TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','completed','failed')),
  payment_reference TEXT        UNIQUE,           -- = id, envoyé comme order_id à Paymee
  psp               TEXT,                         -- 'paymee' pour l'instant
  paymee_token      TEXT,                         -- token retourné par Paymee à la création
  idempotency_key   TEXT        UNIQUE,           -- = id (clé d'idempotence pour creditCustomerWallet)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS topup_req_agency_idx        ON customer_topup_requests(agency_id);
CREATE INDEX IF NOT EXISTS topup_req_customer_idx      ON customer_topup_requests(customer_id);
CREATE INDEX IF NOT EXISTS topup_req_status_idx        ON customer_topup_requests(status);
CREATE INDEX IF NOT EXISTS topup_req_payment_ref_idx   ON customer_topup_requests(payment_reference);

-- RLS : chaque agence ne voit que ses propres demandes (même isolation que le reste du schema)
ALTER TABLE customer_topup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY topup_req_agency_isolation ON customer_topup_requests
  USING (
    agency_id = current_agency_id()
    OR is_super_admin()
  );
