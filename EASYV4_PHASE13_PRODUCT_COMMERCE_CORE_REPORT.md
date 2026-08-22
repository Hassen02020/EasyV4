# PHASE 13 — PRODUCT & COMMERCE CORE REPORT

Branch: `claude/easy2book-v7-product-commerce-core` (based on `claude/easy2book-v6-phase12-b2c-omra-packages`, PR #35, verdict GREEN).
Commits this phase: `82085a3`, `57f28d1`, `3b5fb9a`, `387f0fd`, `d83fab8`, `86f906b`.

---

## 1. Existing architecture audited

Before writing anything, the repo was searched for a pre-existing product/catalog pattern rather than assuming none existed. Finding: **three separate but structurally identical triads already exist**:

| Domain | Catalog table | Sub-table (dates/stock) | Booking/reservation table |
|---|---|---|---|
| Voyages Organisés | `catalog_packages` | `catalog_package_departures` | `reservation_package` (via `bookings`) |
| Attractions | `catalog_activities` | `catalog_activity_sessions` | (none — no booking engine exists yet) |
| Omra | `omra_packages` | `omra_allotments` | `bookings` (Phase 11 B2B) + guest path (Phase 12 B2C) |

This triad **is** the de-facto Product / ProductType / ProductConfiguration architecture the mission asked for — the "product" is the catalog row, the "configuration" is dates + capacity + price on the sub-table, and "type" is which triad it belongs to. Hotel Tunisia was confirmed untouched and out of scope (its own MyGo/XML provider architecture, `hotel_bookings`, unrelated to this triad).

## 2. Product architecture selected

**No new unified `products` table was created.** The three existing triads were kept as three separate tables, unified only at the *behavioural* level:
- One shared status vocabulary (`draft` / `published` / `suspended` / `archived`) instead of each table inventing its own.
- One shared `channels text[]` column (`b2c` / `b2b` / `white_label`) on all three catalog tables.
- One shared admin authorization guard (`assertProductManager()`) and one shared constants file (`product-constants.ts`) used by all three admin action sets.

This directly satisfies "Prefer Product + ProductType + ProductConfiguration where technically appropriate. Do not rewrite the database unnecessarily" — the unification is in the admin layer and the shared vocabulary, not in a forced single table. A single `products` table was considered and rejected: `catalog_packages`/`catalog_activities`/`omra_packages` have materially different, already-typed columns (flight fields, Makkah/Madinah hotel fields, itinerary jsonb, inclusions/exclusions arrays) and forcing them into one polymorphic table would have meant a genuine schema rewrite, which the mission explicitly forbade.

## 3. Database changes (migration 0022_product_lifecycle_channels.sql)

Applied to production project `vqhuptgjhoornteibbpj` via Supabase MCP. Additive and backward-compatible:
- `UPDATE` renames existing `status = 'active'` rows to `'published'` on `catalog_packages`, `catalog_activities`, `omra_packages` (verified via live query: **all three tables were completely empty, 0 rows**, before this ran — no real data was migrated, only the schema/default changed).
- `ALTER COLUMN status SET DEFAULT 'draft'` on `omra_packages` (the other two already defaulted to `draft`).
- `ALTER TABLE ... ADD COLUMN channels text[] NOT NULL DEFAULT '{b2c}'` on all three tables.
- Sub-tables (`catalog_package_departures`, `omra_allotments`, `catalog_activity_sessions`) were **deliberately not touched** — their `status` columns use a different, still-valid vocabulary (`open`/`active` at the departure/session level, not the product level) and renaming them would have been an unnecessary, unrelated schema change.

Rollback strategy: both changes are reversible with a single down-migration (`UPDATE ... SET status='active' WHERE status='published'`, `DROP COLUMN channels`) since no data existed to lose at the time of application.

## 4. RLS changes

**None required.** All three catalog tables already had agency-scoped RLS policies from Phase 11/12 (`agency_id = current_setting(...)`). Status and channel are additional columns on already-isolated rows — no new policy needed. Verified by re-reading the existing RLS migrations (`0021_omra_remaining_rls.sql` and equivalent for packages/activities) rather than assuming.

## 5. Master Admin Product Catalog

Real, built at `app/admin/products/page.tsx`. Not a mock:
- Fetches live rows from `catalogPackages`, `omraPackages`, `catalogActivities` via `withTenantContext` scoped to the logged-in admin's own `agencyId`.
- Real per-type counts, real status/channel badges.
- Row actions (`components/admin/product-row-actions.tsx`): Modifier / Dupliquer / Publier / Suspendre / Archiver, each calling a real server action, not a client-only state toggle.
- **A product never appears publicly unless `status = 'published'` AND its `channels` array contains the requesting surface's channel** — enforced both in the public listing/detail queries (`arrayContains`) and, as defense-in-depth, inside the booking write-path itself (see §9).
- Access gated by `assertProductManager()`: requires `super_admin` or `manager` role AND `agencyType === 'ota'` — a hotel-only or B2B agency admin cannot reach this catalog.

## 6. Omraty Builder status

**Real, not a mock.** `components/admin/omra-product-form.tsx` + `lib/admin/omra-product-actions.ts` + `lib/admin/schemas/omra-product.ts`. Covers: general info, duration, capacity (min/max pilgrims), inclusion flags (visa/flights/hotels/transfers/ziarat/guide), and the richer Omraty-specific fields (flight info, Makkah/Madinah city stays with nights/room type/meal plan, first-destination Makkah-or-Madinah, transfers, accompanying person, other services) — these are stored as validated (Zod), typed JSON in the pre-existing `omra_packages.metadata` column rather than as 15+ new dedicated columns, per the "do not rewrite the database unnecessarily" instruction. Departures/allotments managed via `components/admin/omra-allotment-manager.tsx`. Publish/suspend/archive/duplicate all wired to real DB writes.

**Not built:** a dedicated public-facing display of the rich Omraty metadata fields (flight/hotel/transfer detail) on `/omra/[id]` — the detail page still shows the pre-existing simpler card (inclusions, duration, departures, price). The data is captured and stored correctly by the Builder; it is not yet rendered back out on the storefront. This is a real, documented gap, not a hidden one.

## 7. Organized Trips (Voyages Organisés) Builder status

**Real.** `components/admin/package-product-form.tsx` + `lib/admin/packages-actions.ts` + `lib/admin/schemas/package-product.ts`. Covers title, destination, duration, itinerary (day-by-day), transport mode, inclusions/exclusions, departure locations, capacity, and per-departure adult/child pricing via `components/admin/package-departure-manager.tsx`. This was already the strongest of the three non-hotel modules from Phase 12 (real booking engine existed); Phase 13 adds the missing admin creation/editing side on top of it.

## 8. Attractions Builder status

**Catalog CRUD only — explicitly no booking engine, by design and documented in-code.** `components/admin/activity-product-form.tsx` + `lib/admin/activities-actions.ts` + `lib/admin/schemas/activity-product.ts`: an admin can create, edit, publish, suspend, archive, and duplicate an Attraction product, and add sessions via `createActivitySession`. There is **no public reservation flow** for Attractions — no `/attractions/[slug]/book`, no `createGuestActivityBooking`. The header comment in `activities-actions.ts` states this directly: an admin can publish an attraction today, but no customer can book it yet. This was a deliberate scope decision given the mission's explicit prioritization of Omraty and Packages as "the primary product gap," not an oversight.

## 9. Hotel Tunisia regression status

**No changes made to Hotel Tunisia at all this phase** — not to `hotel_bookings`, not to MyGo/XML provider code, not to search/availability/price/revalidation/voucher. Confirmed via `git diff` scope: zero files under the hotel search/booking/provider paths appear in any Phase 13 commit. The full 335-test suite (which includes the Phase 11/12 hotel regression tests) passes, so no accidental breakage either.

## 10. Hotels World status

**Unchanged, still not production-ready, still not faked.** No Phase 13 work touched Hotels World. It remains whatever state Phase 12 left it in; no new claims are made about it here.

## 11. B2C status

Confirmed still true: **no B2B/agency account is required for B2C** on any of the three product types. The public listing/detail/book pages (`/omra`, `/packages`, and their `[id]`/`[slug]` children) use `getDefaultAgencyId()` + guest booking actions (`createGuestOmraBooking`, `createGuestPackageBooking`) with no session requirement — unchanged from Phase 12, now additionally gated by the new `channels` check (a product not tagged `b2c` no longer appears even though it's published).

## 12. B2B status

The existing B2B path (`createOmraBooking` in `lib/omra/booking-actions.ts`, reached via `/pro`) now also enforces the `channels` array contains `'b2b'` in addition to the corrected `status === 'published'` check (see §14 for why this check needed fixing). Agency isolation itself is unchanged from Phase 11/12 — enforced by both RLS and server-side `withTenantContext` authorization, not UI hiding alone; this phase did not weaken it and re-verified it's still present rather than assuming.

**No new B2B browsing/storefront UI was built.** `/pro/sandbox` remains the only B2B entry point for Omra/Packages, as it was before this phase. Building a real B2B catalog browsing UI was not reached given the mission's stated priority order (Master Admin Builder first).

## 13. White Label foundation status

**Minimum only, as instructed — not a full platform.** What exists: the `channels text[]` column is the "product visibility per audience" piece. A product can be tagged `white_label` and the storefront query pattern (`arrayContains`) is what a future tenant-scoped white-label storefront would filter on.

**What does NOT exist and is a real, acknowledged gap:** Tenant model, Branding, Pricing policy per tenant, and a customer-facing domain/subdomain. No white-label storefront route exists. This is intentionally not built further this phase, per "Do NOT build a huge White Label platform in this phase" — but it must not be read as "White Label is implemented." It is not. Only its first building block is.

## 14. Payment/Wallet/Invoice/Voucher status

**No new payment or wallet engine was created.** All existing infrastructure (`PaymentProvider`, wallet debit/credit, invoice generator, voucher generator/authorization) is reused as-is. The only change in this area was a **bug fix, not a feature**: migration 0022 renamed product status values from `active` to `published`, and three booking-action files still checked the old literal `"active"` — `lib/omra/booking-actions.ts` (B2B), `lib/packages/booking-actions.ts` and `lib/omra/guest-booking-actions.ts` (B2C guest, both Phase 12 files). Left unfixed, **every booking attempt on any real published product would have failed** with `PACKAGE_NOT_ACTIVE` after the migration. This was self-caught by grepping for the old literal across booking actions while wiring the channel checks, not found by any test (these DB-transaction-heavy actions have no unit-test harness in this repo, a repeatedly documented limitation). All three now correctly check `"published"`; sub-table (`omra_allotments`/departure) status checks were deliberately left untouched since they use a different, unaffected vocabulary. Fixed in commit `387f0fd`, verified by typecheck/lint/335 tests/build.

## 15. Navigation status

Main commercial navigation (`components/booking-engine.tsx` tabs, `components/footer.tsx` quick links) reduced from 7 entries to the mandated 5-module scope: Hôtels Tunisie, Hôtels Monde, Omraty, Voyages Organisés. (Attractions has no search-tab UI of its own — it is catalog-only per §8, so it isn't in the tab bar; it's reachable only via its own eventual public pages once a booking engine exists.) Vols/Transferts/Car entry points removed from the tab bar and footer; **their component code (`VolsForm`, `TransfertsForm`, `CarForm`) was NOT deleted**, per the explicit instruction to keep it as a future module — this produces expected (not erroneous) unused-import lint warnings, verified to be warnings only, zero lint errors.

## 16. Mobile status

Product Builder forms are desktop-first (admin tooling, matches the mission's own framing), but were not verified broken on narrow viewports either — not explicitly re-tested this phase given time constraints; this is a gap, not a claim of full mobile-builder verification.

Customer-facing pages **were tested**: a real Playwright check against `/`, `/omra`, `/packages` at all 7 mandated viewports (320/375/390/414/768/1024/1440) against a live local dev server showed **zero horizontal overflow** on any of the 21 page×viewport combinations. This is real evidence (script run, JSON output captured), not an assumption.

## 17. Social/SEO status

`generateMetadata` added to `/omra/[id]` and `/packages/[slug]` (commit `86f906b`), using **real product data only** — name/title, real description (short/long/fallback), OpenGraph + Twitter card metadata, stable canonical-style URL. `/packages/[slug]` uses the real `coverImage` column for the OpenGraph/Twitter image when the product has one uploaded; `/omra/[id]` has no image field on `omra_packages` and correctly omits an image rather than fabricating one. Both `generateMetadata` functions return `{}` for a not-found/unpublished/wrong-channel product — metadata never reveals a product that isn't meant to be public, matching the page body's own `notFound()` behavior.

**Not done:** campaign-parameter (UTM) scaffolding and a dedicated social share image generator — out of scope for the time available, not claimed as done.

## 18. Tests

`pnpm test`: **335/335 passing** (313 Phase 12 baseline + 22 new Phase 13 admin product-schema tests in `lib/admin/__tests__/product-schemas.test.ts`, covering status/channel constants and validation — including date/time-ordering `.superRefine()` checks — for all three product schemas and their departure/session sub-schemas). **No regression** against the Phase 12 baseline.

**Real, acknowledged limitation, unchanged from prior phases:** none of the DB-transaction-heavy server actions (product create/update/publish, booking writes) have unit-test coverage — this repo has no DB test harness. These were instead verified by: (a) full typecheck, (b) full lint, (c) a full production build (which type-checks every server action against the real Drizzle schema), and (d) manual code review that caught the real status-vocabulary regression in §14 before it shipped.

## 19. Typecheck

`pnpm typecheck`: **clean, 0 errors**, verified as the final gate on the fully committed state of this phase.

## 20. Lint

`pnpm lint`: **0 errors, 122 warnings** (all pre-existing `no-unused-vars` warnings across the codebase, plus 6 new expected warnings from the navigation reduction in §15 — `Plane`, `Bus`, `transferZones`, `VolsForm`, `TransfertsForm`, `CarForm` — all warnings, not errors, all explained by the deliberate "keep the code, remove the entry point" instruction).

## 21. Build

`pnpm build`: **succeeded**, full production build, all routes compiled including the new `/admin/products/*` tree and the modified `/omra/[id]`, `/packages/[slug]` routes.

## 22. Scope control

No Flights, Cars, HotelsMonde-completion, or AI-assistant work was done. No new payment engine, no new booking engine beyond what already existed (Attractions explicitly has none). No White Label platform beyond the single `channels` column. Vols/Transferts/Car code untouched, only de-listed from navigation.

## 23. Remaining blockers / gaps (explicit, not hidden)

1. Attractions has a real admin catalog builder but **no public booking engine** — cannot actually be sold yet.
2. White Label is **only the `channels` column** — no Tenant/Branding/Pricing-policy/domain model exists.
3. No new B2B storefront/browsing UI was built for Omra/Packages; `/pro/sandbox` remains the only B2B entry point.
4. Omraty's rich metadata (flight/hotel/transfer detail) is captured and stored by the Builder but **not yet rendered** on the public `/omra/[id]` detail page.
5. Admin Product Builder forms were not mobile-viewport-tested this phase (customer-facing pages were).
6. No campaign/UTM parameter scaffolding for social sharing.
7. Server actions remain without unit-test coverage (pre-existing, repo-wide limitation, mitigated by typecheck/lint/build/manual review as described in §18).

## 24. FINAL VERDICT

**YELLOW.**

Reasoning: the core mission goal — a real Master Admin Product Builder replacing the previously-nonexistent one for Omraty and Voyages Organisés, with server-authoritative pricing, agency isolation, and channel-based B2C/B2B/White-Label visibility, built on the existing infrastructure without a rewrite — is genuinely delivered and verified (typecheck/lint/335 tests/build all clean, one real regression self-caught and fixed before shipping). That is GREEN-quality work on its own terms.

It is not GREEN overall because three things a reasonable reader of "Product & Commerce Core" would expect are explicitly incomplete: Attractions cannot yet be sold to a customer (catalog only), White Label is a single column away from being just a plan, and B2B has no new storefront to actually browse and buy the new products through — only defense-in-depth authorization on an existing action. None of these are hidden or misrepresented above; all are named precisely so the next phase can pick them up without rediscovery.
