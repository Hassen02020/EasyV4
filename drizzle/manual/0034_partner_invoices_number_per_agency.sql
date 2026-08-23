-- Phase 21.2 (P1, defect found during invoice-PDF live verification) —
-- `partner_invoices.invoice_number` had a GLOBAL unique constraint, but
-- `nextInvoiceNumber()` (lib/finance/invoice-actions.ts) computes the next
-- number by counting only THAT AGENCY's existing invoices for the year.
-- Result: two different agencies both issuing their first invoice of the
-- year both compute "FA-2026-00001", and the second insert hits a genuine
-- unique_violation (23505) that the idempotency fallback cannot resolve
-- (it re-reads by reservation_id, which finds nothing, since the real
-- conflict is with an unrelated agency's row) — the invoice is never
-- created. Reproduced live against the local Postgres mirror before this
-- fix. Scopes the constraint to (agency_id, invoice_number), matching the
-- same already-correct pattern on reservations_public_ref_uniq.
drop index if exists partner_invoices_number_uniq;
create unique index partner_invoices_number_uniq
  on partner_invoices (agency_id, invoice_number);
