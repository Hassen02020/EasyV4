-- Phase 21.1 (P0-1) — Reservation/Voucher IDOR remediation.
--
-- `reservations.public_ref` (ex. "TG-2026-000123") is a sequential,
-- per-(agency,year) counter — enumerable, not a security boundary. The
-- guest-facing routes (booking confirmation page, hotel/omra/packages/
-- activities voucher downloads) previously looked up a reservation with
-- `withSystemContext()` (RLS bypass, by design — these routes have no
-- session) filtered ONLY by `public_ref`, letting anyone who guesses a ref
-- read another agency's reservation/customer data or download their
-- voucher PDF.
--
-- This adds a SECOND, private, cryptographically random identifier that
-- those routes must now match IN ADDITION to public_ref. `public_ref`
-- itself is untouched — it remains the human-readable support/
-- communication reference.
--
-- `DEFAULT` uses a non-constant expression (`gen_random_uuid()` — built
-- into Postgres core since v13, no extension required — called twice for
-- 256 bits of entropy). For `ADD COLUMN ... NOT NULL DEFAULT <volatile>`,
-- PostgreSQL rewrites the table and evaluates the default PER ROW, so
-- every existing reservation gets its own distinct token in this single
-- statement — verified live against a 3-row table before applying this
-- migration (3 rows in, 3 distinct tokens out). No separate backfill
-- step, no window where an existing reservation is left without a token.
alter table reservations
  add column guest_access_token text not null
  default (
    replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '')
  );

create unique index reservations_guest_access_token_uniq
  on reservations (guest_access_token);
