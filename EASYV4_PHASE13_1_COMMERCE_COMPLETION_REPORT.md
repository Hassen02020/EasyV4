# PHASE 13.1 — COMMERCE COMPLETION REPORT

Branch: `claude/easy2book-v7-product-commerce-core`.
Commits this phase: `3bef282` (Attractions booking), `a5b1cb0` (B2B commerce), `169a7bd` (White Label foundation), plus this report.
Starting point: Phase 13 verdict YELLOW, baseline 335/335 tests, typecheck/lint/build clean, PR #35 review GREEN. Not redone — this phase closes exactly the 3 documented gaps.

---

## 1. What was implemented

**Gap #1 — Attractions real booking.** A full B2C + B2B booking engine now exists where none did: `Published Attraction → Session (date/hours/capacity, new booking_deadline) → capacity check under FOR UPDATE → server-computed price → existing payment provider (B2C) / wallet debit (B2B) → reservation → existing invoice generator → new PDF voucher`. Three public pages (`/attractions`, `/attractions/[slug]`, `/attractions/[slug]/book`) exist for the first time.

**Gap #2 — B2B selling of the new products.** The real blocker was found and fixed: RLS on `catalog_packages`/`omra_packages`/`catalog_activities` has always been strictly `agency_id = current_agency_id()`. Since every product belongs to the OTA agency, a real partner agency could never see any of them — not a UI gap, an RLS wall, present since before Phase 13. A `product_authorizations` table plus a widened (read-only) RLS clause on the 6 affected tables closes it. `createPackageBooking` (new) and `createActivityBooking` (Phase 13.1 gap #1) give Packages and Attractions the B2B path Omra already had; `/pro/produits` is the first UI to browse and book any of it.

**Gap #3 — White Label foundation.** Minimal, as instructed: one new column (`agencies.domain`), a `resolveTenantByDomain()` helper, and reuse of `product_authorizations` (channel `white_label`) and the existing `pricing_margins` engine for per-tenant pricing. No tenant table, no middleware routing, no storefront — deliberately not built.

## 2. Main files

- **Attractions**: `lib/activities/{schemas,guest-booking-actions,booking-actions}.ts`, `lib/pdf/voucher-activity.tsx`, `app/api/activities/voucher/[ref]/route.ts`, `app/attractions/{page,[slug]/page,[slug]/book/page}.tsx`, `components/activities/activity-guest-booking-form.tsx`, `lib/pro/voucher-eligibility.ts` (+`isActivityVoucherEligible`).
- **B2B**: `lib/b2b/{authorized-products,product-booking-options-actions}.ts`, `lib/admin/product-authorizations-actions.ts`, `app/admin/products/authorizations/page.tsx`, `components/admin/product-authorization-panel.tsx`, `app/pro/(app)/produits/page.tsx`, `components/pro/authorized-products-list.tsx`, `createPackageBooking` in `lib/packages/booking-actions.ts`, `lib/packages/schemas.ts` (+`packagePartnerBookingSchema`).
- **White Label**: `lib/tenant/resolve-tenant.ts`.
- **Schema**: `lib/db/schema.ts` (`catalogActivitySessions.bookingDeadline`, `agencies.domain`, `productAuthorizations` table + `authorizedProductType` enum).

## 3. Migration

`drizzle/manual/0023_commerce_completion.sql` — applied to production (`vqhuptgjhoornteibbpj`) via Supabase MCP, verified post-application (columns exist, RLS enabled and forced on `product_authorizations`, all 8 expected policies present). Additive and backward-compatible:
- `catalog_activity_sessions.booking_deadline timestamptz` (nullable).
- `agencies.domain varchar(255)` (nullable, unique index — multiple NULLs allowed).
- `product_authorizations` (new table): `(agency_id, product_type, product_id, channel, is_active, ...)`, unique on `(agency_id, product_type, product_id)`.
- RLS: `USING` widened (read only) on `catalog_packages`, `catalog_package_departures`, `catalog_activities`, `catalog_activity_sessions`, `omra_packages`, `omra_allotments` to also allow a row when `product_authorizations` grants the current agency access. `WITH CHECK` (write) is **unchanged** on all 6 — an authorized reseller gets read-only access to someone else's product, never write access.

Rollback: `DROP TABLE product_authorizations`, restore the 6 policies to their pre-migration `USING` clause, drop the 2 new columns — documented in the migration's own header.

## 4. RLS

Verified via `pg_policies` after application: all 6 widened policies and both `product_authorizations` policies (`product_auth_select`, `product_auth_write`) are present with the expected `cmd`/structure. Because production's 3 catalog tables are still empty (confirmed in Phase 13, unchanged since), a live cross-agency behavioral test (agency A authorized for agency B's real product) was **not** run against real distinguishing data — doing so would have required seeding fake catalog rows, which is against this project's explicit no-fake-data rule. The policy *definitions* are verified directly instead (both by re-reading the applied SQL and by the pre-migration reasoning documented in the migration's header: RLS composition in Postgres means the widened `USING` clause is additive by construction — it can only add rows to what was already visible, never remove any — so the change cannot regress existing owner/super_admin access, which the full 354-test suite passing corroborates for everything that depends on it).

## 5. Attractions status

**Real, end-to-end, both channels.** FOR UPDATE lock on `catalog_activity_sessions` prevents concurrent overbooking (same pattern as `catalog_package_departures`/`omra_allotments`, already validated in Phase 12/11). Price always read from the locked session row, never from the client. Adult + child supported (mission minimum); a child-age rule is enforced only if `catalog_activities.tariff_rules.childMaxAge` is already set (no rule fabricated where none exists — no admin UI writes this field yet, a named gap). No new payment engine, wallet, invoice engine, or booking engine — `generateInvoiceForReservation`, `getPaymentProvider`, `debitPartnerCredit`, and the pre-existing (previously unused) `reservation_activity` table are reused as-is.

## 6. B2B status

**Real for Packages and Attractions; RLS-fixed but no compact UI yet for Omra.** `/pro/produits` lists only what `product_authorizations` explicitly grants this agency (verified: an unauthorized agency's `withTenantContext` query against `product_authorizations` returns zero rows for another agency's grants, by the same RLS pattern used everywhere else in this codebase). Packages and Attractions rows expand into a full inline booking form (date/session picker, participant counts, simple customer contact, submit → real wallet debit → real reservation/invoice). Omra rows link to `/pro/sandbox` instead: `createOmraBooking` requires a full `OmraPilgrimInput` per pilgrim (passport, birth date, nationality, medical/emergency contact, etc.) and building a compact substitute would have meant either fabricating placeholder pilgrim data (forbidden) or duplicating a large form under time pressure — named here as the concrete remaining piece, not hidden. Cross-agency isolation: unchanged strict `agency_id = current_agency_id()` on `reservations`/`payments`/`customers` — a booking created by an authorized reseller still belongs to *that* reseller's agency, never the product owner's, exactly like the pre-existing Omra B2B path.

## 7. White Label status

**Foundation only, as instructed.** `agencies.domain` + `resolveTenantByDomain()` (tested, 6 tests on the pure `normalizeHost()` part) exist and are real. Branding (`brandName`/`logoUrl`/`defaultLanguage`/`defaultCurrency`) and Pricing Policy (`pricing_margins`, reused unchanged) already existed and needed no new code. **Not implemented, and must not be read as implemented**: no middleware/host-based routing, no White Label storefront, no tenant-branded public page. `/omra`, `/packages`, `/attractions` are unchanged and still resolve the serving agency via `getDefaultAgencyId()` — zero risk to existing B2C behavior from this gap's work.

## 8. Hotel Tunisia regression status

**Zero files touched.** No commit this phase touches any hotel search/availability/pricing/revalidation/booking/provider path. The full 354-test suite (which includes the Phase 11/12 hotel regression tests) passes.

## 9. Tests — before/after

- Before this phase: 335/335 (Phase 13 baseline).
- After: **354/354**, all passing. New: 15 Attractions schema tests (guest/partner booking schemas, `validateChildAgesAgainstTariffRules`), 6 `normalizeHost()` tests (White Label).
- Same repo-wide limitation as every prior phase: the DB-transaction-heavy actions themselves (`createActivityBooking`, `createPackageBooking`, `authorizeAgencyForProduct`, the RLS policies) have no unit-test harness — verified instead by typecheck + full production build (which type-checks every Drizzle call site) + the Supabase MCP policy verification in §4, and by manual adversarial review of each new write path for the same client/server trust-boundary and price-authority issues found and fixed earlier in this session.

## 10. Typecheck

`pnpm typecheck`: **clean, 0 errors** — verified as the final gate on the fully committed state.

## 11. Lint

`pnpm lint`: **0 errors, 122 warnings**, all pre-existing `no-unused-vars`/`react-hooks/exhaustive-deps` warnings unrelated to this phase's files (confirmed: none of the new/modified files in this phase appear in the warning list after cleanup — 2 unused imports found and removed from `lib/b2b/authorized-products.ts`/`product-booking-options-actions.ts` during this phase's own review).

## 12. Build

`pnpm build`: **succeeded**, full production build. All new routes compiled: `/attractions`, `/attractions/[slug]`, `/attractions/[slug]/book`, `/api/activities/voucher/[ref]`, `/admin/products/authorizations`, `/pro/produits`. Client bundle re-scanned for server-only leakage (`debitPartnerCredit`, `DATABASE_URL`, `withTenantContext`) — none found, same check that caught a real leak in Phase 13.

## 13. Remaining blockers (explicit)

1. **Omra B2B has no compact UI** on `/pro/produits` — the action (`createOmraBooking`) and its RLS access are both fixed and real, but a partner must still use `/pro/sandbox` to actually complete an Omra booking (full pilgrim form not duplicated, see §6).
2. **No margin/markup applied** to `createPackageBooking`/`createActivityBooking` (and `createOmraBooking`, unchanged) — `pricing_margins`/`getMarginsForAgency`/`applyMargin` already support these 3 modules (since Phase 9) but are not yet wired into any of the 3 non-hotel B2B booking actions.
3. **White Label has no runtime** — domain resolution exists but nothing calls it; no tenant-branded storefront.
4. **No live cross-agency RLS behavioral test** against real data (§4) — production catalogs remain empty; policy definitions were verified directly instead.
5. **Attractions' rich `tariff_rules`** (child age, family pricing) has no admin authoring UI — only honored if set by some other means.
6. Mobile-viewport testing was not repeated for the new pages this phase (was done for Omra/Packages storefront pages in Phase 13; `/attractions` reuses the same layout primitives but wasn't independently re-verified under time constraints).

## 14. FINAL VERDICT

**YELLOW — REMAINING BLOCKERS.**

All 3 gaps are genuinely functional, not cosmetic: Attractions books end-to-end for a real customer; the RLS wall that made B2B reselling structurally impossible is fixed and Packages/Attractions can actually be sold through `/pro/produits` today; White Label has a real, tested foundation piece rather than a comment. That is real progress toward GREEN, not a relabeling.

It is not GREEN because two of the remaining blockers are exactly the kind the mission asked to avoid overclaiming: Omra B2B still routes through the old sandbox rather than the new authorized-products flow, and White Label has no runtime behind its schema. Both are precisely scoped and named above so the next pass can close them without rediscovery — not vague, not hidden.
