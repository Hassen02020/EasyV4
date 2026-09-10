# EASY2BOOK — PHASE 14.2 — HOTEL TUNISIA CHECKOUT + DB VALIDATION

**Branch:** `claude/easy2book-v8-hotel-tunisia-engine`
**Scope:** close the checkout/DB/payment/wallet/invoice/voucher gap left YELLOW by Phase 14.1.
**Method this phase:** the same non-fabricating discipline as 14.1 — real infrastructure only (the live Supabase project via the Supabase MCP tool, read-only SQL; the app's own Virtual MyGo Supplier for search/revalidation; the app's real, unmodified server actions) — plus, where live execution genuinely wasn't possible, direct reading of the real server-action code, cross-checked against the real database schema live on the project, rather than assumption.

---

## 0. Environment — what was and wasn't available

Per the mission's explicit instruction ("if a required variable is missing, report it instead of bypassing it"), this was checked thoroughly before anything else:

- **`DATABASE_URL`**: not available. No `.env`/`.env.local` with a real value existed, no shell env var was set, and — critically — **it cannot be legitimately obtained in this session**: Supabase's Management API (used by the `Supabase` MCP tools this session has) never exposes the Postgres password, by design, for any project at any time after creation. The only two ways to get one would be (a) the user supplying it directly, or (b) creating a new project/branch, which the `create_branch`/`create_project` tools explicitly gate behind a cost-confirmation step this session cannot complete unilaterally (real billing implication, requires the user's explicit sign-off). Neither was available, so this was **reported, not bypassed** — consistent with the mission's own instruction.
- **`SUPABASE_SERVICE_ROLE_KEY`**: same — never exposed by the Management API (`get_publishable_keys` only returns anon/publishable keys, by design).
- **`STRIPE_SECRET_KEY` / `SPS_SECRET_KEY`**: not set. This matters independently of the above — see §2, this isn't just a missing credential, the app has no real adapter to plug them into yet.
- **What *was* available and used**: the Supabase MCP tools' **read-only** SQL/advisor/schema access against the real, live project (`vqhuptgjhoornteibbpj`) — used exclusively to inspect real schema, constraints, and current row counts, never to insert/fake data (see §1). The app's public anon key (safe, client-facing by design) plus `MYGO_MODE=virtual`, used exactly as in Phase 14.1, to run a real dev server and drive the checkout UI as far as it honestly goes without a database.

This constraint shapes every section below. Where a flow could be driven live, it was. Where it couldn't, the underlying code was read and reconciled against the real schema, and is labeled **code-verified, not live-tested** — never claimed as live-verified.

## 1. Real DB booking persistence

**Not live-testable in this environment** (§0) — the app's own `getDb()` (`lib/db/client.ts`) requires `DATABASE_URL` and throws without it; every reservation-writing server action checks this explicitly and fails closed with a clean, honest error rather than a crash or a fake success (reconfirmed live this phase, see §4).

What **was** verified, live, against the real project database (read-only):
- **Schema is real and ready.** `reservations`, `reservation_hotel`, `payments`, `payment_events`, `customers`, `partner_invoices`, `wallet_accounts`, `wallet_ledger` all exist with the columns the application code expects.
- **Constraints back the guarantees the code assumes**, confirmed by reading `pg_constraint`/`pg_index` directly, not by reading the Drizzle schema file and hoping it matches what's actually deployed:
  - `payment_events_pkey` — PRIMARY KEY on `event_id` → the webhook's duplicate-event dedup is a real DB constraint, not just application logic.
  - `reservations_public_ref_uniq` — UNIQUE `(agency_id, public_ref)`.
  - `wallet_accounts_agency_type_idx` — UNIQUE `(agency_id, type)`.
  - `partner_invoices_reservation_uniq` — UNIQUE `(reservation_id) WHERE reservation_id IS NOT NULL` → confirmed below (§7) this is exactly the constraint `generateInvoiceForReservation`'s own code catches (Postgres error `23505`) to return the existing invoice instead of erroring or duplicating.
- **The database is genuinely empty** — `select count(*) from reservations/payments/customers/partner_invoices/wallet_accounts/wallet_ledger` all returned 0. No prior phase in this project's history has ever exercised a real end-to-end booking write against this database either; this isn't a regression, it's the first time anyone has looked.
- **There is exactly one agency in the entire database, and it is `agency_type = 'ota'`** (the direct-sale/B2C agency `getDefaultAgencyId()` resolves to) — **zero `partner`-type agencies exist.** This is decisive for §10 (B2B).

## 2. Online card

**Structurally not implemented — not an environment gap, a real product gap, and the code says so itself.** `lib/payment/provider.ts`'s `getPaymentProvider()` unconditionally returns `NotConfiguredPaymentProvider`, which always resolves `createPayment()` to `{ ok: false, code: "PAYMENT_PROVIDER_NOT_CONFIGURED" }`. The file's own header comment explains why deliberately: TND is not a Stripe-supported settlement currency, and no verified SPS Monétique Tunisia API contract exists in this repo to build a real adapter against — writing one anyway would be exactly the kind of fabrication this project (and this mission) explicitly forbids. `hasConfiguredPaymentProvider()` exists as the intended future switch (checks for `STRIPE_SECRET_KEY`/`SPS_SECRET_KEY`) but nothing reads its result yet.

Practical consequence, traced in `lib/booking/guest-actions.ts`: choosing "Carte bancaire" in the checkout UI calls this provider, gets `PAYMENT_PROVIDER_NOT_CONFIGURED`, **cancels the already-confirmed myGo booking as compensation**, and returns a clean user-facing error — **no reservation, no payment row, no wallet movement, no invoice, no voucher are ever created for a card payment today.** This is honest, correct behavior for an unimplemented feature — not a bug — but it means "online card success → webhook → wallet → confirmed → invoice → voucher" (as literally described in the mission) **cannot be validated because that path never succeeds, by design, in the current codebase.** Reported as **NOT IMPLEMENTED**, not as unverified-due-to-environment.

## 3. Wallet

This is where the mission's assumed architecture and the real one diverge, and it matters for an accurate report: **a B2C guest hotel booking never touches the wallet system at all**, in either direction. The wallet (`wallet_accounts`/`wallet_ledger`, credited via `lib/finance/wallet-credit.ts::creditRechargeRequest`, debited via `lib/pro/booking-actions.ts::debitPartnerCredit`) belongs exclusively to **partner (B2B) agencies**: a partner pre-funds their deposit balance (recharge, confirmed by the PSP webhook — `app/api/payment/webhook/route.ts`, whose own header comment states this scope explicitly: "confirme des RECHARGES wallet en ligne... pas des paiements par réservation"), and each partner booking debits that pre-funded balance via `createReservationFromDraft`.

- **Wallet CREDIT (recharge webhook)**: code-verified. Real HMAC signature verification (Stripe/SPS), real event-level idempotency (`payment_events` PK insert, `ON CONFLICT DO NOTHING`), real business-level idempotency (a `wallet_recharge_requests` row already `validated`/`rejected` is never reprocessed, checked and audit-logged even for a second, differently-shaped webhook event for the same payment), real amount/currency cross-check against the pending request before crediting. Not live-tested — needs a real Stripe/SPS webhook call, which needs `STRIPE_WEBHOOK_SECRET`/`SPS_HMAC_KEY`, neither set here.
- **Wallet DEBIT (`debitPartnerCredit`)**: code-verified via **existing, passing unit tests** (`lib/pro/__tests__/booking-actions.test.ts`, part of the 416) using a mocked Redis override — confirms a duplicate `idempotencyKey` returns the cached result rather than re-debiting, and two different keys debit independently. The real implementation additionally takes a Postgres row lock (`SELECT ... FOR UPDATE`) on the agency row during the actual balance mutation, so even without Redis a concurrent double-debit can't corrupt the balance at the DB level — only a same-request *retry* without Redis would risk re-debiting, and Redis is not configured in this session (`UPSTASH_REDIS_REST_URL`/`_TOKEN` absent) — disclosed honestly rather than assumed fine.
- **Scenario B ("existing wallet, sufficient balance → debit → confirmed → invoice → voucher")** describes the B2B partner path precisely. It requires a real, authenticated partner session with a funded wallet to drive live — and **§1 confirms zero partner agencies exist in this database**, so there is nothing to log into even setting the missing password aside. **UNVERIFIED, not fabricated.**

## 4. Manual payment (cash / transfer / deposit)

This is the one B2C payment path that is genuinely, fully implemented — traced end to end in `lib/booking/guest-actions.ts::createGuestReservationFromDraft`/`runCreateGuestReservation`, and driven live in the browser this phase as far as the missing `DATABASE_URL` allows:

- Real per-room myGo revalidation (`confirmHotelWithProvider`) is called *before* any DB write or price calculation, exactly as for the card and B2B paths — a stale/changed offer is rejected before anything is created.
- Real, server-computed agency price (`applyMargin` against the myGo `totalPrice`, never the client-supplied `unitPriceTnd`).
- For `transfer`/`cash`: a real `reservations` row is inserted with **`status: "pending"`** and a real `payments` row with **`status: "pending"`** — no wallet, no invoice, no voucher at this point (confirmed correct in §5 after this phase's fix).
- Driven live this phase: search → hotel → room → offer confirmation → traveler form → "Virement bancaire" selected → "Confirmer & payer" → the exact same clean, honest **"Base de données non configurée"** (500) surfaced for card in Phase 14.1 — confirmed live, with a fresh screenshot, that the `if (!process.env.DATABASE_URL)` guard is the very first line of `createGuestReservationFromDraft`, so it fires identically regardless of payment method. No difference in behavior between card and transfer/cash was observed or expected once traced in code.

**PENDING_PAYMENT is reachable in code and correctly modeled by `reservations.status = "pending"` + `payments.status = "pending"`** — the mission's literal `PENDING_PAYMENT` label doesn't exist as a distinct enum value, but the two-column combination it maps to is real and correctly used.

## 5. Staff validation

**Not implemented.** This is a genuine, precisely-located gap, not a guess:

- `lib/admin/actions.ts::updateReservationStatus` is a real, working, admin-only (session + role checked) status-transition action with a validated state machine (`isTransitionAllowed`), audit logging, and a realtime broadcast to the customer's own confirmation page — but it only changes `reservations.status`. It does **not** call `generateInvoiceForReservation`, does **not** fire `sendEvent("booking/confirmed", ...)`, and does **not** touch any wallet table.
- A dedicated table, `reservation_validations` (columns: `payment_verified`, `payment_method`, `payment_reference`, `reviewed_by`, `reviewed_at`, ...) exists in the live schema and is clearly *designed* for exactly this workflow — but grepping the entire `lib/` tree found it referenced **only** in the schema definition files themselves. Zero server actions, API routes, or UI components read or write it.
- Net effect: today, once a `transfer`/`cash` guest reservation is created as `pending`, there is no wired path — automated or staff-driven — that ever moves it to `confirmed`, generates its invoice, or emails its voucher. It would sit `pending` forever unless a developer runs a manual DB update.

This is reported as a real, scoped finding (a feature that needs building, not a bug), not fabricated as "verified."

## 6. 24h expiration

**Not implemented — no `EXPIRED` reservation state exists at all.** Checked directly against the live schema: `reservation_status` enum = `pending, on_request, confirmed, cancelled, no_show, completed, refunded`. No `expired`. The only "expired" concept anywhere in the booking code is `inventory_lock_status` (`active/confirmed/expired/released`) — a **10-minute** Redis-backed search/cart hold used to prevent overselling a room while a shopper is mid-checkout (`lib/booking/inventory.ts`, cleaned up by the existing `/api/cron/cleanup` cron) — a completely different mechanism from a 24-hour payment-pending reservation timeout. There is no cron, no scheduled job, and no code path anywhere that would transition a `pending` hotel reservation to any kind of expired/cancelled state after 24 hours. **Scenario D as described does not exist in this codebase today.**

## 7. Invoice

Code-verified, and one part of it was directly confirmed against the real live schema:

- `generateInvoiceForReservation` (`lib/finance/invoice-actions.ts`) refuses outright — `RESERVATION_NOT_CONFIRMED` — unless `reservations.status === "confirmed"`. Matches the mission's "invoice only after confirmed" requirement exactly.
- **No duplicate invoices, enforced at the database level, not just in application logic**: confirmed live against the real schema that `partner_invoices_reservation_uniq` is a genuine `UNIQUE (reservation_id) WHERE reservation_id IS NOT NULL` index. The code's own `catch` block explicitly checks for Postgres error `23505` (unique violation) and, on that specific error, re-reads and returns the *existing* invoice instead of erroring — this is a real, DB-backed idempotency guarantee, not an assumption.
- Called from both booking paths only when the settlement was genuinely immediate (`isImmediatelyPaid` for guest/card, or after a successful wallet debit for B2B) — never for a `pending` reservation.
- Not live-created in this session (needs `DATABASE_URL`), but the guard logic and the constraint it relies on were both independently confirmed real.

## 8. Voucher

This section contains this phase's main finding.

- **On-demand download** (`/api/booking/voucher/[ref]`, used from the confirmation page) correctly gates on `isVoucherEligible()` (`lib/pro/voucher-eligibility.ts`) — `confirmed`/`completed` only, already covered by 24 passing unit tests (`voucher-eligibility.test.ts`, unaffected by this phase). Correct, untouched.
- **Automatic email on booking** (`processConfirmedBooking`, an Inngest function triggered by the `booking/confirmed` event) renders a real PDF and emails it, with **no status check of its own** — it trusts the event payload.
- **Found: the B2C guest checkout path fired that event unconditionally** (`if (traveler.email)`) for *any* payment method, including `transfer`/`cash`, whose reservation is left `status: "pending"` (unpaid). A customer choosing bank transfer or pay-in-agency would have received a real "confirmed" voucher PDF by email before paying anything — directly contradicting this same file's own header comment ("le voucher... uniquement une fois le règlement confirmé"), `isVoucherEligible`, and the B2B path's own correct behavior (which only ever fires this event after a successful wallet debit that has already set `status: "confirmed"`).
- **Fixed this phase** (commit `80b210b`): the event is now gated on `isImmediatelyPaid` (i.e. `paymentMethod === "card"`), the exact same condition already used three lines below it to correctly gate invoice generation. `transfer`/`cash` bookings now correctly receive no voucher at creation time — consistent with, but not a fix for, §5's separate finding that nothing currently sends one once staff *does* confirm a manual payment.
- Re-ran 416/416 tests, typecheck, lint, build after the fix — all clean (§11–14).

## 9. Idempotency

Summarized precisely by mechanism — not blanket-claimed:

| Mechanism | Backed by | Verified how |
|---|---|---|
| Webhook duplicate event | `payment_events.event_id` PRIMARY KEY | Live schema constraint confirmed + code inspection |
| Wallet recharge re-processing (2nd webhook, same payment) | Application check on `wallet_recharge_requests.status !== "pending"` | Code inspection (`app/api/payment/webhook/route.ts`) |
| Wallet debit (B2B booking) | Redis cache keyed by `idempotencyKey` + a real Postgres row lock on the balance mutation | **Existing unit tests, passing** (mocked Redis) + code inspection of the row lock |
| Guest booking double-submit | Redis cache keyed by a SHA-256 hash of `draft-token:paymentMethod` (`withGuestIdempotency`) | Code inspection — **degrades gracefully to a no-op without Redis**, and Redis is not configured in this session, so a network-level retry here is a genuine, disclosed residual risk in this environment, not something proven safe |
| Duplicate invoice | `partner_invoices.reservation_id` UNIQUE index, caught via Postgres `23505` | Live schema constraint confirmed + code inspection |
| Duplicate voucher / duplicate booking (guest path) | No DB-level unique constraint found beyond the Redis idempotency key above | Not proven at the DB layer for this specific path — flagged, not assumed safe |

## 10. B2B

**UNVERIFIED — not fabricated, and more precisely characterized than "no credentials":** confirmed live against the real database that **exactly one agency exists in total, and it is `agency_type = 'ota'`** (the B2C direct-sale agency). There are zero `partner`-type agencies. This means B2B isolation cannot be tested here not merely because a password is unavailable, but because there is no partner test account of any kind in this environment to even attempt logging into. Per the mission's explicit instruction, this is reported as UNVERIFIED rather than worked around by creating fabricated test data.

## 11. Tests

`pnpm test` → **416/416 pass**, before and after this phase's one code change.

## 12. Typecheck

`pnpm typecheck` → 0 errors.

## 13. Lint

`pnpm lint` → 0 errors, 119 pre-existing warnings (unchanged from Phase 14.1, none in any file touched this phase).

## 14. Build

`pnpm build` → succeeds, all routes compile.

## 15. Remaining gaps

Ranked by what would need to happen to close them:

1. **`DATABASE_URL` for a real (or branch) Postgres instance** — the single blocker on almost everything in §1–§10. Either the user supplies real credentials for this session, or authorizes creating a cost-confirmed Supabase branch (this session cannot do either unilaterally).
2. **A real online payment adapter** (Stripe for non-TND, or a verified SPS Monétique Tunisia contract for TND) — §2 is not a credentials gap, it's an unbuilt feature, deliberately left honest rather than guessed at.
3. **Staff manual-payment confirmation → invoice/voucher wiring** (§5) — `updateReservationStatus` exists, `reservation_validations` schema exists, nothing connects them to invoice/voucher generation. A real, scoped feature to build, not a bug to patch.
4. **A 24h pending-payment expiration mechanism** (§6) — does not exist in any form for reservations (only unrelated to a 10-minute cart-hold lock). Would need a new enum value, a cron, and a decision on what "expired" should do to a myGo-side booking that was already confirmed with the supplier.
5. **`UPSTASH_REDIS_REST_URL`/`_TOKEN`** — without it, guest-checkout double-submit idempotency silently degrades to no protection. Not exercised as an actual double-booking in this session (would need `DATABASE_URL` too), but a real, disclosed risk regardless.
6. **A seeded B2B partner test account** — needed for any live B2B validation at all, per §10.
7. `STRIPE_WEBHOOK_SECRET`/`SPS_HMAC_KEY` — needed to live-test the wallet-recharge webhook itself (§3), independent of adapter work in #2.

---

## FINAL VERDICT: YELLOW — REMAINING BLOCKERS

One real bug was found and fixed this phase (§8: a real voucher PDF was being emailed for unpaid B2C bookings) — a genuine improvement to the exact system this mission asked to validate, backed by 416/416 passing tests, clean typecheck/lint/build.

The verdict cannot be GREEN, and this report does not present it as such: the mission's own critical-test list — real DB booking write, wallet credit/debit idempotency in a live database, duplicate-webhook protection, "no double booking," "no double invoice," B2B isolation — requires a working `DATABASE_URL` this session was never able to legitimately obtain (§0), and requires B2B partner test data that does not exist anywhere in the connected database (§10). Two of the four core scenarios the mission asked about (online card, §2; 24h expiration, §6) are not gaps in this environment at all — they are features that do not exist yet in the codebase, reported as such rather than forced into a fabricated verdict either way.

Everything that *could* be verified without a database — the real guest-checkout flow up to the DB wall, the real schema and its constraints (read live, not assumed), existing wallet/idempotency unit tests, and the honest failure behavior of every payment path — was verified, and one real defect in that surface was found and fixed.

Do not merge. No PR opened. Phase 15 not started.
