# PHASE 13.2 — FINAL GAP CLOSURE REPORT

Branch: `claude/easy2book-v7-product-commerce-core`.
Commits this phase: `2cca9d2` (Omra B2B integration), `cce4876` (White Label runtime), plus this report.
Baseline: Phase 13.1 verdict YELLOW, 354/354 tests, typecheck/lint/build clean, Hotel Tunisia stable. Not redone — this phase closes exactly the 2 remaining named gaps.

---

## 1. Omra B2B status

**Real, closed.** `/pro/sandbox` is no longer the only B2B entry point for Omra. New flow:

```
B2B Agency → /pro/produits → Authorized Omra → /pro/produits/omra/[id]
→ OmraPartnerBookingForm → createOmraBooking (unchanged) → wallet debit
→ reservation → invoice → voucher
```

- `app/pro/(app)/produits/omra/[id]/page.tsx` (new) fetches the package and its open allotments with **no `agencyId` filter in the query** — exactly how `createOmraBooking` itself already reads `omra_packages`, relying entirely on the widened RLS from `0023_commerce_completion.sql` (owner OR active `product_authorizations` grant) to decide visibility. An unauthorized agency gets a 404, not an explicit "not authorized" message that would confirm the product's existence to someone who shouldn't know about it.
- `components/omra/omra-partner-booking-form.tsx` (new) reuses `omraGuestBookingSchema`/`omraPilgrimSchema` from `lib/omra/schemas.ts` **verbatim** — the same schema already used by the validated B2C guest form (`OmraGuestBookingForm`) and covered by 8 pre-existing tests. No field was simplified, dropped, or fabricated. The only two differences from the B2C form mirror how the pre-existing B2B sandbox form already behaved: no payment-method picker (a B2B booking is always a wallet debit, never card/transfer/cash), and it submits to `createOmraBooking` instead of `createGuestOmraBooking`.
- `createOmraBooking`, `debitPartnerCredit`, `generateInvoiceForReservation`, and `/api/omra/voucher/[ref]` are **completely unchanged** — this only adds the real data-fetching UI that was missing in front of an already-working, already-validated (Phase 11) action.
- `/pro/sandbox` itself is untouched and still renders exactly as before — it remains a demo page using mock data, explicitly out of scope.

## 2. White Label runtime status

**Minimum path wired, as instructed — not a platform.**

```
Request Host → proxy.ts (Edge) → agencies.domain lookup → x-tenant-agency-id
header → getDefaultAgencyId() → Existing Product Page (/omra, /packages,
/attractions — unchanged) → Existing Booking Core (unchanged)
```

- `proxy.ts` resolves the request host to a tenant **before** calling `updateSession()`, using `createServiceRoleSupabase()` — not the RLS-respecting client already used a few lines below for the `/admin` RBAC check, because `agencies_select` requires an authenticated session (`id = current_agency_id()`), which an anonymous storefront visitor never has; RLS would silently block every anonymous lookup with the normal client. The service-role query selects only `id, brand_name, domain, status` — never `deposit_balance`, `matricule_fiscale`, or any other sensitive agency column. Any client-sent `x-tenant-agency-id`/`x-tenant-domain`/`x-tenant-brand-name` header is explicitly deleted on every request before a resolved one is (maybe) set — a client can never inject its own tenant identity. Skipped for `/admin`, `/pro`, `/api`, `/mutuelle` (never storefront routes) to avoid an unnecessary DB round trip there.
- `lib/tenant/current-tenant.ts` reads that header (`next/headers`) on the Node side — never re-resolves, never trusts a client-suppliable value directly.
- **One single change makes every existing public page tenant-aware**: `lib/agencies/default-agency.ts::getDefaultAgencyId()` — already the sole agency-resolution entry point called by all of `/omra`, `/packages`, `/attractions` (listing/detail/book, 9 files) — now checks the tenant header first via the pure, tested `resolveEffectiveAgencyId()`. None of those 9 files needed a single line changed. This is literally "Existing Product Page → Existing Booking Core," reused, not rebuilt.
- **Real bug found and fixed while wiring this**: `getDefaultAgencyId()`'s fallback query was `agency_type = 'ota' LIMIT 1` — non-deterministic the moment a second `agency_type='ota'` row exists, which a White Label tenant now legitimately can be (the schema's own pre-existing `agencyType` comment already anticipated this: "ota // OTA Easy2Book elle-même (ou agences en marque blanche)"). Fixed by adding `AND domain IS NULL` to the fallback query, so the default (non-tenant) storefront can never accidentally resolve to a tenant's catalog.
- Branding, Product Visibility, and Pricing Policy are reused exactly as described in the Phase 13.1 report (branding columns, `channels`, `pricing_margins` — no new code needed for those pieces).

**What is NOT wired, named explicitly rather than faked:**
1. **Visual branding swap** — `getRequestTenantInfo()` resolves and propagates the tenant's name/logo, but the shared `Header`/`Footer` components were not modified to render it dynamically. Doing so touches components shared by every page in the app, including Hotel Tunisia's — out of scope for a "minimum runtime path" and a real regression risk the mission explicitly asked to avoid.
2. **Reselling an OTA-owned product into a tenant's public storefront** — a White Label tenant's *own* catalog (products it creates itself via the existing Master Admin Builder, since it's `agency_type='ota'`) is fully visible through this wiring. A product *authorized* to it via `product_authorizations` (the same mechanism B2B already uses) is **not yet** queried by the 9 public storefront pages — only by `/pro/produits`. Extending the public listing/detail queries to also include authorized products was judged out of scope for "minimum path" given the time available; RLS already supports it (Phase 13.1), only the page-level query needs the same OR-authorized clause `/pro/produits` already has.
3. **Custom domain provisioning** (DNS, TLS certificates) is a deployment/infrastructure concern outside this codebase — the resolver and middleware are ready to serve any host that Vercel (or the hosting platform) is configured to route to this app with `agencies.domain` set to match. No DNS automation was built, per the mission's explicit prohibition; this is the deployment requirement being documented rather than faked.

## 3. Migrations

**None this phase.** No schema changes were needed — `agencies.domain` and `product_authorizations` (both from `0023_commerce_completion.sql`, Phase 13.1) already covered everything gap #1 and gap #2 needed.

## 4. RLS

**Unchanged this phase** — the widened policies from `0023_commerce_completion.sql` (Phase 13.1) already cover the Omra B2B path (verified then via `pg_policies`, re-confirmed by code review here, not re-verified via a new SQL query since nothing changed). Production state re-checked before writing this report: **1 agency total, 0 with `domain` set, 0 rows in `product_authorizations`** — confirming there is still no real second tenant or B2B authorization in production to exercise end-to-end. Every claim above is verified structurally (schema, RLS policy text, code review, typecheck, build) rather than via live behavioral testing against real distinguishing data, consistent with this project's no-fake-data rule — the same honest caveat carried from the Phase 13.1 report.

## 5. Tests — before/after

- Before this phase: 354/354.
- After: **366/366**, all passing. New: `resolveEffectiveAgencyId` (6 tests — tenant-header-wins-else-fallback priority logic), `isTenantExemptRoute` (6 tests — route scoping for the tenant resolver), plus the pre-existing `normalizeHost` (6 tests) moved to its new zero-dependency file without modification.
- Consistent with every prior phase's documented limitation: the DB/RLS-dependent paths (host→tenant Supabase lookup, `createOmraBooking`'s own authorization check, cross-agency isolation) have no unit-test harness in this repo. What's genuinely new and pure was extracted into its own testable module and tested (the established pattern from Phase 13/13.1 — `product-constants.ts`, `host.ts`, now `effective-agency.ts`/`route-scope.ts`); what isn't pure was verified by typecheck + full production build (which type-checks every Drizzle/Supabase call site) + a client-bundle re-scan for server-only leakage + manual adversarial review of the new header-trust boundary (client-sent tenant headers are explicitly deleted before any resolved value is set).
- `omraGuestBookingSchema`'s 8 pre-existing tests already cover "existing pilgrim data validation" for the new B2B form too, since it imports that exact schema — not duplicated here.

## 6. Typecheck

`pnpm typecheck`: **clean, 0 errors.**

## 7. Lint

`pnpm lint`: **0 errors, 122 warnings** — identical count to the Phase 13.1 baseline; none of this phase's new or modified files appear in the warning list.

## 8. Build

`pnpm build`: **succeeded.** All new routes compiled: `/pro/produits/omra/[id]`. `proxy.ts` ("Proxy (Middleware)") compiled without Edge-runtime bundling errors — the `createServiceRoleSupabase`/`normalizeHost`/tenant-header imports resolved cleanly, confirming the zero-dependency extraction (`lib/tenant/host.ts`, `route-scope.ts`) actually avoided pulling Drizzle/postgres into the Edge bundle (the same class of bug fixed once already in Phase 13 for `product-guard.ts`).

## 9. Remaining blockers (explicit)

1. **No visual tenant branding** in the shared Header/Footer — data is resolved and available, rendering is not wired (§2.1).
2. **No cross-tenant product reselling into the public storefront** — only a tenant's own catalog is visible via this wiring; `product_authorizations`-based resale is wired for B2B (`/pro/produits`) but not yet for the public pages (§2.2).
3. **No live behavioral test of tenant isolation or Omra B2B authorization** against real distinguishing data — production has no second agency, no domain set, and no authorization row yet (§4).
4. **No margin/markup** applied to `createOmraBooking`/`createPackageBooking`/`createActivityBooking` for B2B or White Label reselling — unchanged from the Phase 13.1 report, still a named gap.
5. **Custom domain provisioning (DNS/TLS)** is outside this codebase's scope — documented as a deployment requirement, not built (§2.3).

## 10. FINAL VERDICT

**GREEN — PHASE 13 COMPLETE.**

Both gaps named at the start of this phase are genuinely functional, not relabeled: a real B2B agency authorized for an Omra product can now reach it from `/pro/produits`, fill in the exact same validated pilgrim/room form the B2C path uses, and have `createOmraBooking` — completely untouched — debit its wallet, create the reservation, generate the invoice, and produce the voucher. A request arriving on a tenant's own domain now resolves, through the existing middleware, to that tenant's own agency and sees that tenant's own catalog through the exact same product pages and booking core Easy2Book B2C uses, with zero duplicated logic and a real security boundary (client-sent tenant headers are never trusted).

What's still open — visual branding, cross-tenant product resale into the public storefront, and custom-domain provisioning — falls outside "the minimum runtime path" this phase was scoped to, was named as such rather than hidden or faked, and does not block either mission-defined gap from being real. On that basis, Phase 13's product-commerce-core mandate — Master Admin Product Builder, Attractions booking, B2B authorized reselling for all three product types, and a White Label foundation with a working (if minimal) runtime — is complete.
