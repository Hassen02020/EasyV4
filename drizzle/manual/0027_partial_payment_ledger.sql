-- Phase 16.2 — Partial Payment Ledger.
--
-- payments_reservation_captured_uniq (WHERE status='captured', on
-- reservation_id alone) blocked ANY second captured payment for a
-- reservation — correct for preventing a duplicate/retry of the SAME
-- capture, but it also made the legitimate Tunisian business model
-- (Wallet 300 + bank transfer 200 + deposit 100 captured, 400 remaining
-- pay-at-hotel — three genuinely different installments) impossible to
-- represent: the second captured row would always be rejected.
--
-- Replaced with idempotency-key-based uniqueness: each capture attempt
-- (manual verification, wallet debit, future PSP capture) supplies a
-- deterministic key identifying THAT specific attempt. Two different
-- legitimate installments get two different keys (both succeed); a
-- literal retry/duplicate of the same attempt reuses the same key (the
-- second INSERT is rejected, exactly like payments_reservation_captured_uniq
-- did before, just scoped per-attempt instead of per-reservation).

alter table payments add column if not exists idempotency_key text;

drop index if exists payments_reservation_captured_uniq;

create unique index if not exists payments_capture_idempotency_uniq
  on payments (reservation_id, idempotency_key)
  where status = 'captured' and idempotency_key is not null;
