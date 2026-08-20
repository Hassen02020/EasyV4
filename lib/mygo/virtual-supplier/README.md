# Virtual MyGo Supplier

A local, in-process simulation of the myGo hotel API, wired in behind the
**same** `MyGoClient` / Zod schema / mapper layer used for the real
integration — not a parallel mock. When `MYGO_MODE=virtual`, `MyGoClient`'s
`baseUrl` is forced (server-side, never client-controllable) to
`/api/virtual-mygo`, so every existing call site (`/api/hotels/cities`,
`/api/hotels/search`, `lib/booking/actions.ts`, `lib/admin/actions.ts`) runs
completely unmodified against it.

## Why JSON, not XML

The real myGo integration in this codebase is a JSON REST API (`fetch` +
`Content-Type: application/json`), confirmed by `lib/mygo/client.ts` and the
Postman test UI referenced in `.env.example`. There is no XML parser
anywhere in this repo to "reuse" — the real parser is the Zod schema layer
in `lib/mygo/schemas.ts`. The virtual supplier returns objects in that exact
shape, so the real schemas/mappers validate a virtual response exactly as
they would a real one.

## Activating

```
MYGO_MODE=virtual
```

No `MYGO_LOGIN`/`MYGO_PASSWORD` required in this mode (any non-empty values
work — the virtual supplier checks presence, not real credentials).

## Structure

- `catalog.ts` — deterministic (seeded) catalog: 60 synthetic hotels
  ("Virtual Hotel 001", ...) across the **real** Tunisia cities/regions
  captured in `lib/mygo/__fixtures__/listcity.json`. Boardings use the 5
  codes confirmed in `lib/mygo/__fixtures__/listboarding.json` (a genuine
  myGo capture — has `Timing`/`Ip` fields).
- `tokens.ts` — HMAC-signed, expiring, search-bound tokens (genuinely
  tamper-detectable, not just an opaque id).
- `inventory-store.ts` — per-(hotel, room, night) availability, with a
  per-key async lock so concurrent booking attempts on the last room
  genuinely race instead of just looking like they do.
- `booking-ledger.ts` — the fournisseur-side booking store, read by
  `BookingList` (used for ambiguous-timeout reconciliation).
- `scenarios.ts` — failure injection. Env default
  (`MYGO_SIMULATION_SCENARIO`) plus runtime override via
  `POST /api/virtual-mygo/control` (test-only, 403s outside virtual mode).
- `engine.ts` — implements every method (`ListCity`, `ListBoarding`,
  `ListCurrency`, `ListTag`, `ListHotel`, `HotelDetail`, `HotelSearch`,
  `BookingCreation`, `BookingCancellation`, `BookingList`).

## Scenarios

`NORMAL`, `NO_AVAILABILITY`, `PRICE_CHANGED`, `INVALID_TOKEN`,
`ROOM_CHANGED`, `HOTEL_ID_MISMATCH`, `TIMEOUT`, `TIMEOUT_AFTER_ACCEPT`,
`TWO_PLAUSIBLE_CANDIDATES`, `BOOKING_REJECTED`, `CURRENCY_MISMATCH`,
`MALFORMED_RESPONSE` (`MALFORMED_XML` accepted as an alias),
`NETWORK_ERROR`, `CANCEL_FAILED`.

`DB_FAILURE` (myGo succeeds, Easy2Book's own DB write then fails) is **not**
a supplier-side scenario — it's injected in `lib/booking/actions.ts` itself,
guarded by `MYGO_MODE === "virtual" && MYGO_SIMULATION_SCENARIO === "DB_FAILURE"`,
because it has to happen after the real booking action's own transaction
starts, not inside the simulated supplier.

## What this proved (found via testing, then fixed)

- `HOTEL_ID_MISMATCH` initially built the response from the wrong hotel
  object — the mismatch never actually appeared. Fixed.
- `BookingCreationResponse`'s money-critical fields (`TotalPrice`, `State`,
  `Currency`, `Id`) were `.optional()` in the Zod schema, so a response
  missing `TotalPrice` would have silently priced a booking at 0 rather
  than failing validation. Tightened with a `superRefine` that requires
  them on any non-error response (real myGo docs mark all four `Y`
  /mandatory), while still allowing a genuine `ErrorMessage` response to
  omit them.
- Inventory concurrency (10 simultaneous attempts on the last room) is
  covered by a real `Promise.all` race in `__tests__/inventory-store.test.ts`
  — exactly one winner, inventory never goes negative.

## Known, honest gaps

- **Multi-room booking**: `BookingCreationResponse.Rooms` and the virtual
  engine both support an array of rooms per booking, matching the myGo
  contract. But the *real app* (`lib/booking/hotel-provider-booking.ts`)
  only ever constructs a single-element `rooms` array today — the search UI
  doesn't yet let a user pick more than one room's occupancy. Testing
  "2 rooms, different occupancy" end-to-end would be testing a capability
  the real booking flow doesn't have yet, not a virtual-supplier gap.
- **Playwright E2E** ("search → filter → sort → book → admin → cancel" as a
  single automated browser flow) and a **load-test script** (100 searches /
  50 concurrent users / 10 simultaneous bookings) were not built in this
  pass — this sandbox can't launch Playwright's CLI browser (missing
  `chromium_headless_shell`, and installing it wasn't attempted per
  standing instructions). The engine/inventory/reconciliation logic those
  would exercise is already covered by the `node:test` suites, which don't
  need a browser.
- **B2B tenant isolation** under the virtual supplier specifically wasn't
  re-tested here — it depends on Supabase auth/RLS, which is a separate,
  pre-existing concern from the supplier simulation itself.
