-- ============================================================
-- RLS policies for wallets & wallet_transactions tables
-- Ensures multi-tenant isolation per agency.
-- ============================================================

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Wallets: agencies can only see their own wallet
CREATE POLICY "wallet_agency_isolation" ON wallets
  FOR ALL USING (
    agency_id = (
      SELECT agency_id FROM users
      WHERE id = auth.uid()
    )
  );

-- Wallet transactions: agencies can only see their own transactions
CREATE POLICY "wallet_tx_agency_isolation" ON wallet_transactions
  FOR ALL USING (
    agency_id = (
      SELECT agency_id FROM users
      WHERE id = auth.uid()
    )
  );

-- Admin/service role bypass (full access)
CREATE POLICY "wallet_service_bypass" ON wallets
  FOR ALL USING (true)
  WITH CHECK (true);

CREATE POLICY "wallet_tx_service_bypass" ON wallet_transactions
  FOR ALL USING (true)
  WITH CHECK (true);

-- Grant usage to authenticated role
ALTER POLICY "wallet_service_bypass" ON wallets TO service_role;
ALTER POLICY "wallet_tx_service_bypass" ON wallet_transactions TO service_role;
ALTER POLICY "wallet_agency_isolation" ON wallets TO authenticated;
ALTER POLICY "wallet_tx_agency_isolation" ON wallet_transactions TO authenticated;
