# PHASE 12 — PR #35 REVIEW

**PR:** #35 — `claude/easy2book-v6-phase12-b2c-omra-packages` → `main`
**Diff:** 37 files, +4233 / −66 (7 commits, merge-base `988a2e7` = PR #34's head, no divergence from `main`)
**Scope of this review:** audit only. No new features, no Phase 13, no broad refactor, no merge performed.

---

## 1. Overall verdict

# GREEN — safe to merge

No security vulnerability, no broken tenant isolation, no secret leak, no duplicated
payment/wallet/invoice engine, zero test regression (313/313, up from Phase 11's 265/265).
PR #35 does exactly what it claims: a real B2C guest-checkout engine for Hotel, plus the
first-ever booking engines for Omra and Packages, all server-price-authoritative.

**But GREEN is about this PR's own correctness, not about Omra/Packages being
business-operable end-to-end.** Section 5/6/7 below found a large, genuine, **pre-existing**
gap — no admin product-builder exists anywhere in the repo for Omra or Packages, not before
this PR and not after it — that isn't a defect in PR #35 (out of its stated scope) but is the
real blocker to launching either module for real. Flagged as the Phase 13 priority, not as a
reason to hold this merge.

---

## 2. What PR #35 actually implements

- **Hotel B2C guest checkout** (`lib/booking/guest-actions.ts`): a parallel path to the
  existing `createReservationFromDraft` (B2B, untouched). Resolves the tenant via
  `getDefaultAgencyId()` instead of a partner session, reuses `confirmHotelWithProvider`
  unchanged (same P0 price-integrity guard from Phase 11), settles via a new
  `PaymentProvider` abstraction instead of `debitPartnerCredit`.
- **`PaymentProvider` abstraction** (`lib/payment/provider.ts`): `createPayment` /
  `confirmPayment` / `refundPayment` / `getPaymentStatus`, with an honest
  `NotConfiguredPaymentProvider` default. No Stripe/SPS adapter added — Stripe doesn't
  settle in TND and no verified SPS API contract exists in the repo.
- **Omra guest booking engine** (`lib/omra/guest-booking-actions.ts`): same guest-checkout
  model, reusing the same `FOR UPDATE` allotment-lock + server-price pattern as the existing
  B2B `createOmraBooking` (untouched). Replaces the sandbox-only entry point
  (`/pro/sandbox`, mocked data) with a real `/omra/[id]/book` flow.
- **Packages booking engine** (`lib/packages/booking-actions.ts`): the **first** booking
  engine this module has ever had (B2C or B2B) — before this PR, `/packages/[slug]` was a
  read-only catalog with a WhatsApp CTA. Built directly on the already-adequate schema
  (`catalog_packages` / `catalog_package_departures`, real seats/price columns).
- **3 new voucher PDF routes + eligibility guards** (hotel/omra/package), all reusing the
  Phase 11 `confirmed`/`completed`-only rule via dedicated `isXVoucherEligible` functions
  (never touching the already-validated `isVoucherEligible`).
- **RLS migration** `0021_omra_remaining_rls.sql`, applied to the live Supabase project via
  MCP and verified post-application (see §13 for method).
- **Rate-limit resilience fix**: Upstash timeout now fails open instead of 500ing search
  routes.
- **48 new tests** (schemas, eligibility, idempotency, payment provider, structural
  price/agency-forgery regression) + 2 new E2E spec files, actually executed against a local
  dev/prod server in this session (see §17).

---

## 3. What is genuinely production-ready

- Hotel guest checkout: **real**, same price-integrity guarantee as B2B, real Redis-backed
  idempotency, real invoice generation on paid confirmation.
- Omra guest checkout: **real**, real seat lock, real price, real pilgrim data capture, real
  voucher/invoice on confirmation.
- Packages guest checkout: **real**, real seat lock, real adult/child pricing, real voucher/
  invoice on confirmation.
- RLS on the 4 previously-open Omra tables: **real**, applied and verified in production.
- Payment: **honestly not-configured** — no Stripe/SPS credentials exist in the repo, so
  "card" payment always returns `PAYMENT_PROVIDER_NOT_CONFIGURED` today. This is the
  correct, non-fabricated state, not a bug.

## 4. What is still demo/mock

- **Nothing added by this PR is mock.** The one remaining mock in these three modules is
  `/pro/sandbox`'s `OmraBookingForm` (pre-existing, `MOCK_PACKAGES`/`MOCK_ALLOTMENTS`), which
  PR #35 did **not** remove (per the mission's own rule: never remove a mock before its
  replacement works — the replacement, `/omra/[id]/book`, now works, so removing the sandbox
  mock is a safe, small follow-up, not done here to avoid scope creep on this review).
- Card payments are unconfigured everywhere (Hotel/Omra/Packages) — by design, not a gap in
  this PR's code.

---

## 5. Security findings

**No P0/P1 found.** Specifically checked against the Phase 11 `draft.unitPriceTnd` vulnerability
class:

| Path | Price source | Client can influence price? |
|---|---|---|
| Hotel guest | `myGoBooking.totalPrice` (server, post-revalidation) | No — `draft.unitPriceTnd` only feeds the pre-checkout *display* estimate; the charge always re-derives from the provider-confirmed booking, identical to the B2B path |
| Omra guest | `allotment.overridePrice ?? pkg.basePrice`, read under `FOR UPDATE` | No — `omraGuestBookingSchema` has **no price field at all** (verified by a test that injects `totalTnd`/`unitPriceTnd` and asserts Zod strips them) |
| Packages guest | `departure.adultPriceTnd`/`childPriceTnd`, read under `FOR UPDATE` | No — same structural guarantee, same test pattern |

Other checks:
- **Forged `agencyId`**: none of the 3 guest actions accept an `agencyId` parameter at all;
  it's always `getDefaultAgencyId()`. Verified structurally (schema has no such field) and by
  reading every call site.
- **Forged product/departure ID**: all three re-fetch the product/departure row inside the
  locked transaction and validate `status` before pricing — a stale or fabricated ID that
  doesn't match an active row is rejected (`PACKAGE_NOT_FOUND`/`ALLOTMENT_NOT_ACTIVE`/etc.),
  never silently accepted.
- **Duplicate payment / double-click / retry**: all three use `withGuestIdempotency`
  (server-computed content-hash key — for Omra/Packages I originally had the client generate
  a random UUID client-side, caught by the React Compiler's purity lint rule during this
  session, and fixed by moving key derivation server-side, matching the pattern the Hotel
  path already used).
- **Booking without successful payment**: structurally impossible — `status` is only set to
  `confirmed` inside the same transaction that already required `paymentResult.ok === true`
  for the card branch; a rejected payment throws and rolls back before any reservation row
  commits (no stock consumed either).
- **Payment without a valid booking**: N/A — there is no separate payment-first flow; payment
  and booking commit atomically in one transaction per module.
- **Client bundle secrets**: fresh production build inspected — no `SUPABASE_SERVICE_ROLE_KEY`,
  `STRIPE_SECRET_KEY`, `SPS_*`, `MYGO_LOGIN/PASSWORD`, `DATABASE_URL`, `CRON_SECRET`, or any
  other server secret appears in `.next/static/chunks`. Server Actions correctly compile to
  opaque RPC references (`createServerReference(<hash>, ...)`) — verified the actual bytes
  around `createGuestOmraBooking`'s reference; only the hashed action ID and the Zod schema
  (legitimately client-shared for form validation) appear, never the function body, DB query,
  or payment logic.

## 6. Payment findings

- `PaymentProvider` is a clean interface; the only implementation is
  `NotConfiguredPaymentProvider`, which returns `{ok:false, code:"PAYMENT_PROVIDER_NOT_CONFIGURED"}`
  on every method — verified by 6 unit tests, never a fabricated success.
- No wallet coupling: none of the 3 guest paths call `debitPartnerCredit` — confirmed by
  grep, zero matches in any Phase 12 file. B2C and B2B settlement stay fully separate, as the
  mission required.
- Transfer/cash: real `pending` reservations with `payments.status="pending"` — voucher/
  invoice correctly withheld until a human confirms the payment (no automated flip to
  `confirmed` exists for these methods, which is honest — no auto-fake-confirm).

## 7. Booking findings

Architecture matches the requested shape exactly for all 3 modules:

```
Customer → Product → Availability (locked) → Server price → Payment → Booking → Invoice → Voucher
```

No `.strict()`-less schema issue found — Zod's default unknown-key stripping was verified
(not assumed) via the forged-field tests in §5. No simulation language remains in the
customer-facing checkout copy (removed "(simulation)" wording this session).

## 8. Omra findings

- **Booking engine: real**, same guarantees as Hotel/Packages (see §5, §7).
- **Admin/product-builder capability: not implemented — pre-existing gap, not caused by this
  PR.** Grepped the entire repo for any write path to `omraPackages`
  (`insert(omraPackages)`/`update(omraPackages)`): **zero results outside a stress-test
  script.** `/admin/reservations/omra` is a reservations-list redirect
  (`redirect("/admin/reservations?type=omra")`), not a product editor. None of the fields
  listed in the review request (program name/month/year/dates/airline/airports/hotels/
  nights/transfers/itinerary/pricing/capacity/inclusions/visibility flags) have any admin UI
  — packages can currently only be created via direct SQL. This was true before PR #35 and
  remains true after it; PR #35's scope (Partie 7-10 of the Phase 12 mission) was the
  customer-facing engine, not this admin tool.

## 9. Packages findings

Same conclusion as Omra: the schema (`catalog_packages`/`catalog_package_departures`) is
**genuinely configurable in principle** (real columns for price/seats/dates/inclusions), but
**no admin CRUD UI exists** to actually configure it — confirmed by the same grep (zero
`insert(catalogPackages)`/`update(catalogPackages)` outside my own new booking action, which
only *reads* the catalog, never writes it). **Not claiming Packages are launch-ready** —
the booking engine is real; the product-management tooling to operate it is missing,
identically to Omra.

## 10. B2B findings

PR #35 does not touch any B2B code path (`debitPartnerCredit`, `createReservationFromDraft`,
`createOmraBooking`, wallet tables, partner invoices) — confirmed by diff review: every
B2B function I depend on is imported and called, never edited. Phase 11's RLS-based
cross-agency isolation (`agency_id = current_agency_id() OR is_super_admin()`) is unchanged.
I did not re-run Phase 11's own cross-agency B2B tests (out of scope for this PR, they were
already green and this PR doesn't touch that code), but did verify no B2B table's RLS policy
was altered by `0021_omra_remaining_rls.sql` (that migration only targets
`omra_packages`/`omra_allotments`/`omra_flights`/`omra_room_allocations`).

## 11. White Label findings

**Not implemented — confirmed by search, not assumed.** `agency_type` enum
(`lib/db/schema.ts`) has exactly two values, `ota` and `partner`; the `ota` value's own code
comment says "OTA Easy2Book elle-même (**ou agences en marque blanche**)" — white-label was
anticipated in a comment, never built. No distribution mechanism exists for sharing one
product across multiple storefronts without duplication. This is a **pre-existing gap**, not
something this PR removed or broke, and not something this PR claims to deliver.

## 12. Database findings

One migration in this PR: `drizzle/manual/0021_omra_remaining_rls.sql`.

| Item | Detail |
|---|---|
| Tables changed | `omra_packages`, `omra_allotments`, `omra_flights`, `omra_room_allocations` |
| Columns added | None — RLS only |
| Indexes/constraints/FKs | None added |
| RLS enabled? | Yes, all 4 (`ENABLE` + `FORCE ROW LEVEL SECURITY`) |
| Policies | `<table>_tenant_isolation`, `FOR ALL`, `agency_id = current_agency_id() OR is_super_admin()` — direct for `omra_packages`, via subquery on `omra_packages`/`reservations` for the other 3 (no direct `agency_id` column) |
| Data migration risk | None — RLS policies don't move or transform data |
| Rollback difficulty | Trivial (`DROP POLICY` + `DISABLE ROW LEVEL SECURITY`), not scripted but one-line if ever needed |
| No dangerous `USING(true)` | Confirmed — every policy gates on `current_agency_id()`/`is_super_admin()` |
| Applied to production? | Yes, via Supabase MCP against project `vqhuptgjhoornteibbpj`, verified post-application: `relrowsecurity`/`relforcerowsecurity = true` on all 4, security advisor no longer flags them, `app_runtime` role's existing grants unaffected |

**No duplicated parallel product tables** (`omra_products`/`package_products`/etc.) were
created — `catalog_packages` (generic) and `omra_packages` (Omra-specific, pre-existing
Sprint 3A schema, deliberately separate because Omra pilgrim/visa/flight data doesn't fit the
generic package model) are the only two, and PR #35 didn't add a third.

## 13. RLS findings

Covered in §12. Additionally verified (via Supabase MCP `execute_sql`, live queries, not
assumed): the DB role backing this session's connection is `postgres`
(`rolbypassrls=true`), matching Supabase's known default — but a dedicated `app_runtime`
role **already exists** on this project (`rolbypassrls=false`, full CRUD grants on all 6
Omra tables confirmed). **Not verifiable from this sandbox**: whether the deployed Vercel
app's `DATABASE_URL` actually authenticates as `app_runtime` rather than `postgres` — this
determines whether RLS is *actually enforced* for the running app or only structurally
present. Exact operator check:

```sql
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = current_user;
-- run this via the SAME DATABASE_URL the deployed app uses
```

## 14. Provider findings

Hotel provider architecture is unchanged and not duplicated. The guest path imports
`confirmHotelWithProvider` (existing abstraction boundary) and `getMyGoClient()` (only for
the rollback-compensation cancel call) — both pre-existing, both already the sanctioned
integration points. No new myGo-specific code was added outside that boundary; myGo
credentials remain server-env-only (`MYGO_LOGIN`/`MYGO_PASSWORD`), confirmed absent from the
client bundle (§5).

## 15. UX findings

Built on the existing component library (shadcn/ui, same Card/Select/Input/Badge primitives
already used across the app) — no new design system introduced. Forms use responsive
Tailwind grid classes matching the existing `checkout-form.tsx`/`travelers-form.tsx`
conventions (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`). Loading/error/empty states present
everywhere I touched: submit-button spinners, inline Zod field errors, an `Alert` block for
server-returned errors, and honest "no departures available → contact fallback" states on
both `/omra/[id]` and `/packages/[slug]` (never a dead "Réserver" button with no bookable
departure). Not full-suite tested across mobile/tablet/desktop viewports this session (no
browser interaction, only route-level Playwright checks — see §17); flagging as unverified
rather than claiming a visual pass.

## 16. Code quality findings

**Real duplication found, self-reported:**

- **4 near-identical `nextPublicRef`/`next*PublicRef` implementations** — same
  `SELECT MAX(publicRef) WHERE agencyId=... AND publicRef LIKE prefix%` algorithm, differing
  only by prefix constant (`TG-`, `OM-` ×2, `PK-`). Two of the four are new in this PR
  (`lib/omra/guest-booking-actions.ts`, `lib/packages/booking-actions.ts`) because the
  pre-existing `omra`/booking-actions.ts` versions weren't exported. **Not fixed in this
  review pass** (would be a cross-file refactor, out of scope for an audit) — flagged as a
  clean, low-risk post-merge consolidation: `nextPublicRef(tx, agencyId, prefix)`.
- The 3 guest-booking transactions (Hotel/Omra/Packages) share a real structural skeleton
  (resolve agency → lock inventory → price → pay → insert reservation → insert extension →
  decrement stock → audit) that isn't extracted into a shared helper. Deliberately left
  un-abstracted: the per-module differences (myGo revalidation vs. seat-count lock vs.
  passenger-list insert) are substantial enough that a generic helper would likely become
  leaky or over-parameterized — flagged as a judgment call, not an oversight, and left for a
  human architectural decision rather than forced now.
- No dead files, no unused exports, no circular imports found in the new code (typecheck/
  build both clean, which would catch circular-import cycles in most cases).
- No client component does server-only work: verified by scanning for `"use server"` files
  imported directly by `"use client"` components — the only cross-boundary import is
  `import type { GuestPaymentMethod }` (type-only, erased at compile time, confirmed safe by
  a passing production build after this was specifically caught and fixed once already this
  session).
- No server action does excessive client-facing work — all 3 stay within a single DB
  transaction plus a couple of best-effort fire-and-forget follow-ups (invoice, email),
  matching the established pattern.
- No hardcoded demo values in the new code (all data flows through real DB reads).

## 17. Regression findings

| | Before (Phase 11) | After (PR #35) |
|---|---|---|
| Tests | 265/265 | **313/313** (+48 new, 0 regressions) |
| typecheck | clean | clean |
| lint | 0 errors, 119 warnings (pre-existing, untouched) | 0 errors, 119 warnings (identical set) |
| build | green | green (fresh rebuild performed for this review) |

E2E: ran the **full existing suite** (not just new specs) against a live local server —
29/33 pass. The 4 failures (`a11y.spec.ts` ×2 admin pages, `auth.spec.ts` dashboard,
`booking-flow.spec.ts` homepage flash-offer) are pre-existing specs this PR doesn't touch,
failing because they need a real `DATABASE_URL`/Supabase session this sandbox doesn't have —
confirmed by reading the actual server error (`NEXT_PUBLIC_SUPABASE_URL manquant`), not
assumed. The 11 new specs (2 files) pass 11/11, actually executed, not just written.

## 18. Tests: 313/313

## 19. Build result: PASS (fresh `pnpm build`, all 37 changed files compile, both new voucher
routes and both new `/book` pages correctly register as dynamic routes)

## 20. Required corrections before merge

**None.** No defect found in PR #35's own code that blocks merging it.

## 21. Optional improvements after merge

1. Consolidate the 4 `nextPublicRef` implementations into one parameterized helper (§16).
2. Remove `/pro/sandbox`'s mock `OmraBookingForm` now that the real `/omra/[id]/book` flow
   exists (mission rule: only remove a mock once its replacement works — it now does).
3. Investigate the soft-404/soft-redirect on `/booking/*` routes (`notFound()`/`redirect()`
   inside a segment covered by `app/booking/loading.tsx` commit their 200 status before the
   streamed body resolves to 404/redirect content) — confirmed pre-existing (not
   Phase-12-introduced) via the sibling `/pro/booking/confirmation/[ref]` route (same guard,
   no wrapping `loading.tsx`, correct status). Non-blocking: real users' browsers execute the
   client-side navigation correctly; this only affects HTTP-status-level tooling (SEO
   crawlers, uptime monitors, non-JS clients).
4. Verify in production whether `DATABASE_URL` authenticates as `app_runtime` or `postgres`
   (§13) — operational check, not a code change.
5. A dedicated `booking/omra.confirmed`-style Inngest event for Packages confirmation email
   (currently skipped rather than misusing the hotel-specific `booking/confirmed` event —
   see the code comment in `lib/packages/booking-actions.ts`).

## 22. Recommended Phase 13

**Admin product builders for Omra and Packages** (§8/§9) — this is the actual business
blocker, not anything in PR #35. Concretely: CRUD UI for `omra_packages`/`omra_allotments`
and `catalog_packages`/`catalog_package_departures`, with draft/publish/suspend/archive
states and duplicate-without-bookings semantics (per the review request's §6). Until this
exists, every Omra/Package product in production has to be inserted by direct SQL — the
guest booking engines built in PR #35 have nothing to sell without it. White Label (§11)
should follow once the product-builder exists, since it needs a real distribution model to
attach to.

---

*Scope note: this review did not attempt full mobile/tablet/desktop visual QA (§15), full
B2B cross-agency integration tests (§10 — out of PR #35's diff, already green pre-existing),
or a live payment-provider test (§18 of the original request — no provider is configured
anywhere in the repo to test against, honestly, per §6).*
