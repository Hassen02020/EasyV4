-- WALLET-WEBHOOK-SECURITY-01 : PSP identity column on wallet_recharge_requests
-- Allows the webhook handler to verify that the PSP sending the webhook matches
-- the PSP that was used to initiate the recharge (prevents cross-PSP spoofing).
-- Nullable so existing records (cash/virement/mandat/chèque, which never touch
-- the webhook path) are unaffected.
ALTER TABLE wallet_recharge_requests
  ADD COLUMN IF NOT EXISTS psp VARCHAR(32);

COMMENT ON COLUMN wallet_recharge_requests.psp IS
  'PSP identifier (stripe|sps|paymee) — set only for card_international recharges. NULL for offline methods (cash/virement/mandat/chèque).';
