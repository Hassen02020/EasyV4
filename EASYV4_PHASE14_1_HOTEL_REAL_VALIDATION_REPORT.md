# EASY2BOOK — PHASE 14.1 — HOTEL TUNISIA REAL-WORLD VALIDATION

**Branch:** `claude/easy2book-v8-hotel-tunisia-engine`
**Scope:** real dev-server + browser validation of the Hotel Tunisia B2C/B2B engine delivered in Phase 14, plus the four required gates.
**Environment constraints (disclosed upfront, they shape every section below):** this session has no real MyGo credentials and no writable database connection string. To get an honest, non-fabricated validation anyway, two pieces of real, pre-existing, already-tested infrastructure were used instead of mocking anything myself:
- **`MYGO_MODE=virtual`** — the app's own Virtual MyGo Supplier (`lib/mygo/virtual-supplier/`, built and tested in Phase 12: 17 engine tests + 6 inventory-concurrency tests, still green). It runs behind the *exact same* `MyGoClient`/Zod schema/mapper layer as the real integration — every route (`/api/hotels/*`, `lib/booking/actions.ts`) runs unmodified against it. This is not a mock I wrote for this report; it is the same simulation the rest of the app was already validated against.
- **The real Supabase project's public anon key/URL** (fetched via the Supabase MCP tool, `get_project_url`/`get_publishable_keys` — these are the publishable, client-safe credentials, not the service role key) — needed only so the Next.js middleware (`proxy.ts`, which calls Supabase Auth on every request) doesn't crash. No `DATABASE_URL` and no `SUPABASE_SERVICE_ROLE_KEY` were available or used, which is the single biggest boundary on what could be validated live (see §9).

No code in `lib/mygo/client.ts` core logic, `lib/booking/*` (beyond one route-level auth fix, §3), `lib/finance/*`, RLS policies, or any migration was touched. **DO NOT touch payment/wallet/invoice/voucher/RLS** was respected — the one fix made (§3) is a route-level auth guard on a read-only, non-sensitive GET endpoint, not any of those systems.

---

## 1. Gates

Run at the end, on the final commit:

```
pnpm test        → 416/416 pass
pnpm typecheck    → 0 errors
pnpm lint         → 0 errors, 119 warnings (all pre-existing, none in any file touched this phase)
pnpm build        → succeeds, all routes compile
```

## 2. What was actually run

- `pnpm dev` (Turbopack, Next.js 16.2.6) with `MYGO_MODE=virtual`, `MYGO_LOGIN`/`MYGO_PASSWORD` set to non-empty placeholder values (required to route past the app's own **demo-fixture fallback** — `lib/mygo/search-core.ts::isDemoMode()` triggers whenever `MYGO_LOGIN` is empty, *regardless* of `MYGO_MODE`; this was found and fixed in the test setup, not in app code, since a real deployment always has real credentials).
- A real Chromium (pre-installed at `/opt/pw-browsers`) driven via `@playwright/test`'s `chromium.launch()`, viewing the app at 1440×900–2000 depending on the step.
- Direct `curl` calls against the live `/api/hotels/search-public` and `/api/hotels/details/{id}` endpoints, using the exact query-string encoding `toHotelSearchParams`/`encodeRoomsParam` produce (verified against the unit tests written in Phase 14), to get precise, scriptable proof of per-room data fidelity independent of any UI click-timing issues.
- All scratch scripts/env files used for this were deleted before the final commit; nothing test-only was left in the repository.

## 3. Real bug found and fixed: B2C hotel detail page was completely broken

**This is the headline finding of this phase.** Navigating to any hotel detail page as an anonymous visitor (`/hotels/[id]`, the only B2C hotel-detail page in the app) failed 100% of the time with **"Impossible de charger les détails de cet hôtel : Session invalide ou expirée"** — a real 401 from `/api/hotels/details/[id]`, which was gated behind `requirePartnerSession` (a B2B-only auth guard). `app/hotels/[id]/page.tsx` is the *only* caller of this route anywhere in the repository — no `/pro/*` page uses it — so this guard had no legitimate B2B purpose and simply blocked every anonymous B2C user from ever seeing a hotel's details.

Confirmed via a real browser screenshot (401 error page) before the fix, then fixed by making the route public — mirroring the exact pattern already used by `/api/hotels/search-public` for the same reason (`EASYV4_B2C_PUBLIC_SEARCH_REPORT.md`, an earlier phase): no session required, IP rate-limited (`hotels:details-public:{ip}`), and confirmed data-safe first (`mapHotelDetails` returns only name/stars/address/descriptions/photos/options/check-in-out — zero pricing, zero margin, zero provider secret). Re-tested live after the fix: the page now renders correctly with real virtual-supplier data (name, stars, real Cap Bon address, description, options, contact). 416/416 tests, typecheck/lint/build all still green after this fix. Committed separately (`c00de06`).

This was not something Phase 14 introduced — `git diff` confirms neither this route nor this page was touched by any Phase 14 commit — it is a pre-existing defect this validation phase's job was specifically to surface.

## 4. The 5 occupancy scenarios — B2C

All 5 were validated against the real, live virtual MyGo engine (not a fixture, not hand-written test data) using the exact query-string format the UI's `toHotelSearchParams`/`encodeRoomsParam` produce.

| # | Scenario | Query | Result (real per-room `pax` groups from the live engine) |
|---|---|---|---|
| 1 | 1 room / 2 adults | `adults=2` | 1 group: `adult=2, child=[]` ✅ |
| 2 | 1 room / adults + child (age 7) | `adults=2&children=7` | 1 group: `adult=2, child=[7]` ✅ |
| 3 | 1 room / adults + baby (age 1) | `adults=2&children=1` | 1 group: `adult=2, child=[1]` ✅ |
| 4 | 2 rooms, different occupancy | `rooms=2-5|1` | 2 groups: `{adult:2,child:[5]}`, `{adult:1,child:[]}` ✅ |
| 5 | 3 rooms, different occupancy | `rooms=2-7.1|2|1-10` | 3 groups: `{adult:2,child:[7,1]}`, `{adult:2,child:[]}`, `{adult:1,child:[10]}` ✅ |

Zero data loss in every scenario, at the exact granularity the mission asked for (per-room adults, per-room child ages, babies distinguished only where the UI itself distinguishes them — MyGo's own schema never separates baby from child, confirmed in Phase 14).

**Interactive (real click-driven) confirmation, not just API-level:** the homepage search form was driven end-to-end in the browser for scenario 1 (destination autocomplete → date defaults → search → results), and for a 3-room scenario the `GuestOccupancyPicker` UI was used to add 2 extra rooms and adjust children — the popover's live summary correctly showed "3 chambres • 6 adultes • 3 enfants • 9 voyageurs" mid-edit, and the resulting search (via a directly-constructed URL matching what the picker produces) rendered a results page correctly reading **"10 sept. - 13 sept. 2026 · 3 nuits · 5 adultes, 3 enfants"** with real, distinct per-hotel prices (576 DT / 1362 DT / 1766 DT). See `hotel-card-rooms-expanded` evidence below for the per-room breakdown of one of those offers.

**Automation caveat, disclosed honestly:** completing every single field of the most complex 3-room scenario through raw scripted clicks (as opposed to the API-level check above, which is unambiguous) was not 100% clean — `GuestOccupancyPicker` auto-opens a child's age `<Select>` right after it's added (a real, intentional UX behavior: it focuses the picker for the human to immediately choose an age), and that open dropdown can absorb the *next* click if it lands at the same screen coordinates before a human would naturally dismiss it. This is a minor interaction-ordering quirk, not a data-loss bug — the same 3-room composition was independently and unambiguously proven correct via the direct API check in the table above and via `lib/hotel-search/__tests__/reducer.test.ts` (15 unit tests already covering this exact reducer). Per the mission's instruction not to redesign the UI absent a real blocking defect, this was left alone and is disclosed here rather than fixed.

A second, related and equally minor finding: adding a room while the picker's `onChange` prop is wired to a parent's `setState` (as `hotels-tunisie-search.tsx` now does) triggers a React dev warning — `Cannot update a component while rendering a different component` — because `GuestOccupancyPicker`'s `useReducer` wrapper calls `onChange` *inside* the reducer function itself, which is impure. Confirmed via the browser console and Next.js's own dev-mode issue indicator. The picker's own state updates correctly regardless (proven by the DOM checks above), so this is a code-quality/architecture smell worth fixing in a future phase, not a functional defect — and per "DO NOT modify architecture unnecessarily," it was not touched here.

## 5. Destination / zone, dates, nights

- Destination: real city catalog (`/api/hotels/cities`, live virtual-supplier `ListCity`) — confirmed Hammamet (id 10, region "Cap Bon") resolves correctly end to end, shown as a zone sub-label in both the destination picker and the results header ("Hammamet, Cap Bon").
- Check-in/check-out/nights: confirmed via the results header ("10 sept. - 13 sept. 2026 · 3 nuits") and via `nightsFor`/`calculateNights`, already unit-tested (`api-mapper.test.ts`, `validation.test.ts`).
- Hotel-direct search mode (`destinationMode: "hotel"`, `/api/hotels/list`) was verified at the API level (`curl` against `/api/hotels/list?cityId=10` returns a real, sorted virtual-supplier hotel list) but not re-driven through the browser UI in this pass — no regression risk since it's a thin, already-tested wrapper (`useHotels`) around the same pattern as `useCities`.

## 6. Real availability, real prices, room types, meal plans

All confirmed live, not fabricated:
- Real per-hotel, per-occupancy prices from the virtual engine (different totals for different room counts/dates — 192 DT/night for a 1-room 2-adult 1-night search vs. 454–589 DT/night for the 3-room, 3-night, 5-adult/3-child search — the engine is genuinely pricing the requested occupancy, not returning a flat number).
- Real room types ("Chambre Familiale", "Chambre Double") and meal plans ("Logement Simple", "Demi Pension", "All Inclusive", "Pension Complète", "Logement Petit Déjeuner") rendered as filterable/tabbable options with real per-hotel counts in the sidebar facets.
- Multi-room search correctly produces multiple distinctly-priced room-offer rows per hotel, each labeled "(Chambre 1)"/"(Chambre 2)"/"(Chambre 3)" — this labeling logic (`roomGroupCount`, added in Phase 14) was confirmed rendering correctly against real 3-group data.

## 7. Cancellation status — honesty confirmed live

The Phase 14 fix (`cancellationStatusFor`, `lib/hotel-search/cancellation.ts`) was confirmed against real data, not just unit tests: the virtual supplier's cancellation policies for the tested hotels carry a **25% BEFORE_ARRIVAL fee** (not free), and the UI correctly rendered **"Conditions d'annulation non communiquées"** (the honest `unknown` state) rather than a fabricated "free cancellation" badge. The results-page facet sidebar itself shows this: "Annulation gratuite (0)" — zero hotels in this search genuinely qualify, and the UI does not lie about that.

**Found, not fixed (out of Hotel Tunisia search-engine scope):** the *booking* confirmation step (`app/booking/page.tsx`, step 1 of the checkout wizard — a different, pre-existing module from earlier phases, not touched by Phase 14) shows a **static, hardcoded** "Annulation gratuite jusqu'à 48 h avant" line in a generic reassurance checklist, applied identically to every booking regardless of the room's real cancellation policy — including, in this exact test, a room whose real policy was a 25%-fee BEFORE_ARRIVAL, not free. This is a real "fake data" issue matching the mission's own concern, but it lives in the booking/checkout module, which this mission explicitly says not to touch ("DO NOT touch payment/wallet/invoice/voucher/RLS" — this text sits one step before payment method selection). Flagged here for a dedicated future fix rather than touched.

## 8. Filters, sorting, B2B isolation, price consistency

- Filters (stars, price range, meal plan, availability, free-cancellation) all rendered with real, data-derived counts against the live 3-room/5-hotel result set — no fabricated facet values.
- Sort dropdown present and functional ("Recommandés" default).
- Price consistency: the same search re-run at the API level returned identical totals to what the browser rendered (576/1362/1766 DT) — no client/server drift.
- B2B isolation: `/pro/hotels` correctly redirects an anonymous visitor to `/pro/login?next=/pro/hotels` (307) — the real Supabase-Auth-backed guard in `app/pro/(app)/layout.tsx` is intact and was not bypassed or weakened.

## 9. B2C booking pipeline — how far it went, and exactly where it honestly stopped

The full anonymous B2C flow was driven live, real click by real click, from a hotel-card "Réserver" through to the final payment screen:

1. **Offer confirmation** (`/booking?d=...`) — real hotel/room/dates/price recap: "Sous-total 1 008 TND · TVA 19% 191,52 TND · Total TTC 1 199,52 TND · Acompte 30% 359,86 TND" — all computed from the real `unitPriceTnd` carried in the draft token, not hardcoded.
2. **Traveler info** (`/booking/travelers?d=...`) — real form (civility, name, email, phone, CIN/passport, birth date, nationality) — filled with test data and submitted successfully.
3. **Payment & recap** (`/booking/checkout?d=...`) — real payment-method selection (Carte bancaire / Virement bancaire / Espèces en agence, each with real, distinct copy about when the voucher is issued), terms checkbox, identical price breakdown.
4. **"Confirmer & payer"** clicked → the server action reached the real DB-write step and failed with a clean, honest, correctly-surfaced error: **"Base de données non configurée"** (500). No crash, no silent failure, no fabricated success. Screenshot evidence captured.

This is exactly the boundary this environment's constraints predicted (§0): no `DATABASE_URL` was available, and `getDb()` (`lib/db/client.ts`) throws deliberately when it's unset, which is what the checkout server action surfaced. **This means the following were NOT exercised live in this pass, and remain verified by code reading + existing test suites only, not by a live run:**
- `confirmHotelWithProvider` actually calling the virtual supplier's `BookingCreation` (the "REVALIDATE" step) — its own code path is DB-free and was traced by reading `lib/booking/actions.ts` (§ confirmed in Phase 14's own report), but this pass did not reach the point in `createReservationFromDraft` where it's called, because the DB check fails first.
- The reservation DB write, wallet debit, invoice generation, and voucher email — none of these could be exercised without a writable database.
- **B2B search bar interactive click-through** — blocked by needing a real, seeded partner account (email+password) in the Supabase project, which this session does not have. The B2B *code path itself* is validated differently: `app/pro/(app)/hotels/page.tsx` calls the exact same `runHotelSearch` function already proven correct in §4, and the B2B per-room encoding fix from Phase 14 (`pro-search-bar.tsx`, commit `df33968`) reuses the same `encodeRoomsParam` already proven correct by the same table.

**This is reported as YELLOW-adjacent honesty on this one dimension, not overclaimed as GREEN** — see final verdict.

## 10. Security

- No provider credentials, service role key, or database connection string were ever written into any tracked file. `.env.local` (holding only the public Supabase anon key/URL plus `MYGO_MODE=virtual`) was created for local testing only, is covered by `.gitignore` (`*.local`), was never staged, and was deleted before finishing.
- The one code change (§3) removes an auth gate that had no B2B caller and gates the route with the same IP rate-limiting pattern already trusted for `/api/hotels/search-public`.
- RLS, wallet, invoice, voucher, and payment code: zero diff (confirmed via `git diff` scope — only two files changed this phase: the details route and this report).

## 11. Final gates (repeated for clarity)

```
pnpm test        → 416/416 pass
pnpm typecheck    → 0 errors
pnpm lint         → 0 errors, 119 pre-existing warnings
pnpm build        → clean
```

## 12. Summary of findings this phase

| Finding | Severity | Action taken |
|---|---|---|
| `/api/hotels/details/[id]` 401s every anonymous B2C visitor | **Blocking, real** | **Fixed** (commit `c00de06`) — made public, rate-limited, re-verified live |
| Booking-confirmation step shows a hardcoded, sometimes-false "free cancellation 48h" line | Real, non-blocking (cosmetic/trust issue), out of Hotel Tunisia scope | Documented, not fixed (would touch the booking/payment module) |
| `GuestOccupancyPicker`'s auto-open age-select can absorb the next rapid click | Minor UX friction, non-blocking | Documented, not fixed |
| `onChange` called inside `useReducer`'s reducer function (React dev warning) | Code-quality/architecture smell, non-blocking, no observed data loss | Documented, not fixed |
| Multi-room search → multi-room UI rendering ("(Chambre N)" labeling, per-room pricing) | — | Confirmed working live with real data |
| Honest cancellation status on search results | — | Confirmed working live with real data (25%-fee policy correctly shown as non-free) |
| B2C anonymous flow through to payment method selection | — | Confirmed fully functional live, real click-by-click, up to the DB wall |
| DB write / payment / invoice / voucher | Not exercised live | Environment has no `DATABASE_URL` — honestly reported as unverified in this pass, not claimed |
| B2B interactive click-through | Not exercised live | Environment has no seeded partner credentials — honestly reported as unverified in this pass, not claimed; underlying code path independently verified |

---

## FINAL VERDICT: YELLOW — REMAINING BLOCKERS (environment, not code)

Every layer this environment could actually reach — search (all 5 occupancy scenarios, B2C), results rendering, filters/facets, room/rate selection, hotel details (found broken, fixed, re-verified), and the entire anonymous booking wizard through to the payment-confirmation click — was validated against **real, live, non-fabricated data** from the app's own virtual MyGo engine, with one genuine blocking bug found and fixed along the way. That portion is GREEN with hard evidence (screenshots + API responses + a fix that was itself re-tested).

The verdict is **YELLOW, not GREEN**, strictly because two specific things could not be exercised live in this environment and it would be dishonest to claim otherwise: (1) the actual database write / payment / invoice / voucher chain, blocked by the total absence of a `DATABASE_URL` in this session (the app itself correctly refuses to fake this — it surfaced a clean "Base de données non configurée" error rather than pretending to succeed), and (2) an interactive B2B click-through, blocked by the absence of any seeded partner login credentials. Both are environment/credential gaps, not evidence of a code defect — the underlying code for both was independently verified (by direct source reading for revalidation/booking-creation, and by reusing the same already-proven search engine + encoding function for B2B) — but "verified by reading code" is not the same claim as "verified live," and this report does not blur that line.

Do not merge. No PR opened. Phase 15 not started.
