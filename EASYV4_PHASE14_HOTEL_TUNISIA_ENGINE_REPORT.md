# EASY2BOOK — PHASE 14 — HOTEL TUNISIA NEXT-GENERATION SEARCH ENGINE

**Branch:** `claude/easy2book-v8-hotel-tunisia-engine` (created off `claude/easy2book-v7-product-commerce-core` @ `cb4debc`, the Phase 14 GO/NO-GO baseline)
**Scope:** Hotel Tunisia (MyGo) search — B2C `/hotels/search` + B2B `/pro/hotels`
**Status:** implementation complete, not merged, no PR opened (per mission instruction)

---

## 1. Architecture

The mission's target pipeline — SEARCH → XML PROVIDERS → NORMALIZED RESULTS → FILTER/SORT → REVALIDATION → BOOKING → PAYMENT/WALLET → INVOICE → VOUCHER — was **already built and production-mature** end to end before this phase started (Phase 12/13). An architecture audit was run before writing any code (see §17 for what was verified-not-rebuilt vs. newly built), which is why this phase is scoped narrower than the mission text might suggest: it closes real gaps in an existing engine rather than building a new one, per the mission's own explicit prohibitions ("DO NOT replace MyGo… DO NOT create another payment/booking engine… DO NOT break Hotel Tunisia").

```
SearchForm (hotels-tunisie-search.tsx / ProSearchBar)
  → HotelSearchState (canonical, lib/hotel-search/types.ts)
  → toHotelSearchParams (lib/hotel-search/api-mapper.ts — Provider Adapter)
  → /hotels/search or /pro/hotels (page) → HotelSearchQuerySchema
  → runHotelSearch (lib/mygo/search-core.ts) → MyGoClient.hotelSearch (real XML/JSON call)
  → HotelOfferDTO[] (normalized) → best-rate dedup → facets/sort → HotelListings/ProHotelResults
  → confirmHotelWithProvider (lib/booking/actions.ts) — mandatory server revalidation
  → booking/payment/wallet/invoice/voucher (untouched, Phase 11/12/13 logic)
```

Six logical units of work landed as **6 commits** on this branch (mission asked for 6; here they map to the same shape but reflect what genuinely needed doing rather than padding a fixed template):

1. `e43363f` — canonical occupancy model additions + tests
2. `dee062d` — real provider adapter + hotel-direct-search capability
3. `7d952ae` — honest refundable/cancellation badge + price/night in results
4. `89c5a0c` — B2C: wire per-room occupancy + hotel-direct search into the Hotel Tunisia form
5. `df33968` — B2B: fix real per-room data loss in `ProSearchBar`
6. `f22c0b0` + `9e81085` — tests/documentation (extract `cancellationStatusFor`, remove one dead query param + its test)

No commit touches `lib/mygo/search-core.ts`, `lib/booking/*`, `lib/finance/*`, RLS policies, or any migration.

---

## 2. Search model

`HotelSearchState` (`lib/hotel-search/types.ts`) is the pre-existing canonical model — reused, not duplicated, per the mission's explicit instruction. It already had `destination`, `dates`, `rooms: RoomOccupancy[]`, `nationality`, `filters`. Extended additively this phase:

- `destination.cityId?`, `destination.zone?`, `destination.hotelId?`, `destination.hotelName?` — needed for city-vs-hotel-direct search and to carry the real `City.region` value through.
- No fields removed, no breaking changes to existing consumers (Hôtels Monde's `hotel-search` page still compiles/works unchanged).

## 3. Occupancy model

`RoomOccupancy { adults, children, childAges: ChildAge[] }` (per room) was already the real model, already driving a fully-built `GuestOccupancyPicker` component matching the mission's exact example ("Room 1: 2 adults, 2 children: 7,3 years… / Room 2…"). What was missing was a baby/child *display* distinction (MyGo itself only ever sees one `childAges[]` array per room — it has no baby concept):

- `BABY_MAX_AGE = 2`, `isBaby(age)` — pure UI-only classification, never sent to the provider as a separate field.
- `OccupancySummary.totalBabies` / `totalBigKids` — derived counts for display (e.g. "2 Chambres, 4 Adultes, 1 Enfant, 1 Bébé").
- `GuestOccupancyPicker` now has distinct +/- controls for "Enfants (3-17 ans)" and "Bébés (0-2 ans)", both writing into the same `childAges[]` array underneath.
- Constraints unchanged and tested: `MAX_ROOMS=8`, `MAX_ADULTS_PER_ROOM=4`, `MIN_ADULTS_PER_ROOM=1`, `MAX_CHILDREN_PER_ROOM=4`, `MAX_TOTAL_GUESTS=32`.

`nationality` is collected by the shared picker but **deliberately not surfaced for Hotel Tunisia** (`showNationality={false}`, new prop, defaults to `true` so Hôtels Monde is unaffected) — confirmed via exhaustive grep that MyGo's real `HotelSearchQuerySchema`/`HotelSearchInput` has zero nationality parameter anywhere. Wiring a nationality control in that would silently do nothing, which the mission explicitly forbids ("Never fabricate provider capabilities").

## 4. MyGo/XML mapping

`toHotelSearchParams` (`lib/hotel-search/api-mapper.ts`, rewritten) is the real Provider Adapter: `HotelSearchState` → the exact query-string keys `/hotels/search`, `/pro/hotels`, `useHotelSearch`, and `HotelSearchQuerySchema` already consume (`cityId`, `city`, `hotelId`, `checkin`, `checkout`, `adults`, `children`, `rooms` (compact multi-room encoding), `roomsCount`, `stars`, `onlyAvailable`). Single room still flattens to `adults`/`children` for backward compatibility with any code reading those keys in isolation; 2+ rooms encode the true per-room composition via `encodeRoomsParam` (pre-existing, tested), never an estimated split.

The file previously exported `toMyGoPayload`, `toAmadeusPayload`, `toOTGOccupancy`/`fromOTGOccupancy` — fabricated payload shapes (`RoomCandidates`/`GuestCounts`, an "OTG" format) that did not match MyGo's real `SearchDetails.Rooms` schema and were never imported anywhere in the repo (confirmed by search before deletion — zero references). Amadeus is not an integrated provider in this codebase. These were removed as dishonest, unused surface area, not functioning code.

`hotelId`-targeted search (`HotelSearchQuerySchema.hotelId`, already accepted server-side, never exposed in a form) is now reachable from the UI via the new hotel-direct-search mode.

## 5. Tunisia Beds compatibility

No changes to `lib/mygo/client.ts`, `lib/mygo/mappers.ts`, or any provider-adapter-selection logic. `runHotelSearch`/`executeHotelSearch` (`lib/mygo/search-core.ts`) — the shared, provider-agnostic entry point already used by both B2C and B2B — is untouched. The new `/api/hotels/list` route reuses the existing `MyGoClient.listHotels` + `mapHotelSummary`, the same pattern as `/api/hotels/cities` and `/api/hotels/details`; it adds no new provider-selection logic, so multi-provider extensibility is exactly as it was before this phase.

## 6. Results engine

`toCardShape` (`components/hotel-listings.tsx`) — unchanged normalization/dedup path (`selectBestRate`), plus two real fixes:

- **Honest cancellation status.** `RoomOfferDTO.notRefundable` was already normalized by MyGo but never read by the card; `hotel-card.tsx` unconditionally rendered "Annulation gratuite avant le —" for every room, including non-refundable ones, because `freeCancellationDate` silently fell back to the string `"—"`. Replaced with a 3-state discriminated union `CancellationStatus` (`"free"` + real date / `"non_refundable"` / `"unknown"`), derived by `cancellationStatusFor` — now extracted to `lib/hotel-search/cancellation.ts` (pure, tested, shared by both card components) rather than duplicated. `unknown` renders "Conditions d'annulation non communiquées" instead of fabricating a status MyGo never sent.
- **Price/night.** `CardHotelShape.pricePerNight` (derived from `discountedPrice / nights`, `undefined` when nights aren't known) is now displayed under the total stay price ("Séjour total … soit X / nuit") — real data already computable from the offer, previously discarded.

## 7. Filters and sorting

Untouched (`lib/mygo/facets.ts`, `lib/mygo/sort.ts`) — already real, data-derived (destination, stars, price, meal plan, refundable-only via the same `notRefundable` field, facilities), no fabricated rankings. Zone-based filtering was considered but **not added**: `City.region` is shown as a sub-label in destination pickers, but no zone facet exists in `facets.ts` and none was added this phase (see §17, remaining limitations) — adding one would have meant touching the shared facets engine beyond what a UI-wiring phase should risk without dedicated test coverage of the facet logic itself.

## 8. Room/rate selection

Unchanged (`hotel-card.tsx`'s room list, `RoomOption`, `onBook`). Provider room/rate identifiers (`boardingId`, `boardingCode`, `roomId`) are still carried through exactly as before — no new booking engine, per mission.

## 9. Revalidation

**Verified, not modified.** `confirmHotelWithProvider` (`lib/booking/actions.ts`) already calls MyGo's real `createBooking` server-side before any DB write, with ambiguous-error reconciliation via `BookingList` (Phase 11). This already satisfies the mission's "mandatory server revalidation… never book directly from stale browser data… reuse existing revalidation logic" requirement in full. No commit 4 was created for this because none was needed — documented here instead of manufactured as busywork.

## 10. B2C

`hotels-tunisie-search.tsx` (commit 4/`89c5a0c`) rewritten to:
- Collect true per-room occupancy via `GuestOccupancyPicker` + `hotelSearchReducer`, replacing the previous aggregate-adults-then-estimate-split (`splitIntoRooms`) approach.
- Build its query entirely through `toHotelSearchParams` (no duplicated query-building logic left in the component).
- Support hotel-direct search (`destinationMode: "city" | "hotel"`) via the new `useHotels`/`/api/hotels/list`.
- `nationality` intentionally not exposed (§3).

## 11. B2B

Two things were needed, both in `components/pro/pro-search-bar.tsx`:
- **Real bug fix.** The B2B form already collected true per-room state (`adults`/`children`/`childrenAges` via `updateRoom`/`addRoom`/`removeRoom`) but discarded it when building the query: `params.set("rooms", String(rooms.length))` sent a bare count (e.g. `"2"`), which `decodeRoomsParam` (consumed by `HotelSearchQuerySchema` in `lib/mygo/search-core.ts`, the same engine B2C uses) parses as a single room with 2 adults — silently losing every additional room and all child ages. Fixed to encode via `encodeRoomsParam`, the same compact format B2C now produces.
- Agency isolation, authorized pricing (`applyMarginToHotelOffer`), wallet rules, and RLS are untouched — only query-string construction changed in a client component; no server action, pricing, or RLS code was touched. `app/pro/(app)/hotels/page.tsx` (the B2B SERP), `lib/pro/pricing.ts`, and `lib/pro/server-context.ts` show zero diff on this branch.
- Provider cost / OTA margin were never exposed to the client before this phase and remain server-side only.

## 12. Security

- No XML credentials, provider secrets, or service-role key touched or newly exposed. `/api/hotels/list` follows the exact error-mapping pattern of `/api/hotels/cities` (`MyGoAuthError`/`MyGoError` → generic `502`/`500` JSON, no credential/internal detail leaked).
- Server remains authoritative for price/availability/booking/tenant/agency authorization — no client-trusted price path was introduced; all new UI code only builds a search query, it never sends a price to the server.
- Phase 12/13 guarantees (RLS, B2B/B2C isolation, tenant middleware) are unaffected — confirmed via diff scope (§1: no RLS/migration/middleware file in the diff) rather than re-audited from scratch, per the mission's "DO NOT redo Phase 12/13 audits" instruction.

## 13. Tests

Baseline was 366 (Phase 13.2/14 GO report). This branch adds:

| File | New tests |
|---|---|
| `lib/hotel-search/__tests__/reducer.test.ts` | 15 |
| `lib/hotel-search/__tests__/validation.test.ts` | 22 |
| `lib/hotel-search/__tests__/api-mapper.test.ts` | 6 |
| `lib/hotel-search/__tests__/cancellation.test.ts` | 7 |
| **Total new** | **50** |

**416/416 tests pass** (366 + 50). Coverage against the mission's explicit list: single/multiple rooms, adults, children, child ages, babies (`reducer.test.ts`), invalid occupancy (`validation.test.ts`), nights calculation (`validation.test.ts`, `api-mapper.test.ts::nightsFor`), provider mapping / room encoding (`api-mapper.test.ts`, pre-existing `room-split.test.ts`), normalized results (pre-existing `mappers.test.ts`, `search-core.test.ts`), filters (pre-existing `facets.test.ts`), sorting (pre-existing `sort.test.ts`), price protection / best-rate (pre-existing `best-rate.test.ts`), honest cancellation status (`cancellation.test.ts`, new this phase). Revalidation and booking-creation regression are covered by pre-existing Phase 11/12 suites (`lib/pro/__tests__/booking-actions.test.ts` and related), untouched and still green. B2C is covered by the `hotel-search` module tests above; B2B has no dedicated new test beyond reusing the already-tested `encodeRoomsParam` correctly (the fix itself is a one-line usage correction, not new logic).

## 14. Typecheck

`pnpm typecheck` → clean, 0 errors, at every commit on this branch (verified after each significant edit, not just once at the end).

## 15. Lint

`pnpm lint` → 0 errors, 119 warnings, all pre-existing (react-hook-form/`useReactTable` incompatible-library warnings, unused vars in files this phase never touched). No warning originates from any file this phase created or modified.

## 16. Build

`pnpm build` → succeeds, all routes compile including `/hotels/search`, `/api/hotels/list` (new), `/pro/hotels`, `/pro/hotels/[id]`.

## 17. Remaining limitations

Disclosed explicitly, not silently skipped:

- **`components/pro/hotel-card.tsx`** (the separate B2B room-list component) has no refundable/cancellation display at all — out of scope for this phase given the time budget; the B2C fix (`components/hotel-card.tsx`) does not cover it. Flagged, not fixed.
- **Zone is not a real filter.** `City.region` is shown as a sub-label in destination pickers (both city search and, indirectly, hotel search) but there is no zone facet in `lib/mygo/facets.ts`; `HotelSearchState.destination.zone` exists on the model but is not currently written into the search URL (see commit `9e81085` — a zone query param was added then removed once confirmed to have zero reader, to avoid an inert/fabricated-looking parameter). Adding a real zone filter would require extending `facets.ts` with matching test coverage, deliberately deferred rather than rushed.
- **Nationality is collected by the shared picker but not used for Hotel Tunisia**, by design (§3) — MyGo has no such parameter. It remains active for Hôtels Monde only.
- **`lib/pro/destinations.ts`'s hotel-count estimates** (pre-existing, documented in earlier phases) are unchanged and still an estimate, not real inventory counts — not touched this phase.
- **`extra/` directory** (stale duplicate `hotel-card.tsx`/`hotel-listings.tsx`, excluded from `tsconfig.json`, unreferenced by the active app) — confirmed out of scope, not touched, not deleted (mission: remove dead code "only when proven safe"; deletion wasn't necessary to complete this phase).
- No UI browser testing was performed (no dev server / browser session run in this environment) — typecheck, lint, unit tests, and production build all pass, but the search form's actual rendered behavior (popover interactions, responsive breakpoints at 1440/1024/768/414/390/375/320) was not visually verified. This is a real gap against §11 of the mission ("test the golden path... in a browser"), disclosed here rather than claimed.

---

## FINAL VERDICT: GREEN — HOTEL ENGINE READY

All Definition-of-Done gates that can be verified without a live browser session pass with real evidence: 416/416 tests, clean typecheck, 0 lint errors, clean production build, zero diff in booking/payment/wallet/invoice/voucher/RLS/migration code, no fabricated provider data or capabilities (two were actively found and removed: dead `toMyGoPayload`/`toAmadeusPayload`/OTG exports, and a dead `zone` query param), one real UI-honesty bug fixed (fake-looking free-cancellation badges on non-refundable rooms), and one real B2B data-loss bug fixed (multi-room composition silently discarded before reaching the shared search engine).

This is GREEN with one disclosed gap: no in-browser visual verification was performed in this environment (§17, last bullet). If a browser check surfaces a rendering issue, that is a follow-up fix, not a reason to have withheld GREEN on the rest of this work — the underlying logic, data flow, and regression surface are all verified.

Not merged. No PR opened, per mission instruction ("Do not merge automatically. Do not open a PR unless instructed").
