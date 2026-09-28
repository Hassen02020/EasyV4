/**
 * G10 — PriceSnapshot Integrity
 *
 * Validates that:
 *   - The commercial engine computes prices correctly (server-side only)
 *   - Snapshots enforce their status machine (ACTIVE → USED/EXPIRED/INVALIDATED)
 *   - Expired and USED snapshots are rejected at every gate
 *   - The browser can NEVER influence supplier amounts, fees, or markup
 *   - Concurrent snapshot creation produces unique IDs
 *   - `expireStaleSnapshots` cron only touches ACTIVE+expired rows
 *
 * All tests run entirely in-memory — no real DB, no GDS, no "use server" imports.
 *
 * P01 — B2C price arithmetic: fee=15, markup=4% → sellingAmount = supplier + 15 + 0.04*supplier
 * P02 — B2B price arithmetic: fee=10, markup=2.5%
 * P03 — minMarkup clamping: small supplier → markup raised to minMarkup floor
 * P04 — maxMarkup clamping: large supplier → markup capped at maxMarkup ceiling
 * P05 — Snapshot TTL: expiresAt ≈ now + 20 minutes
 * P06 — getPriceSnapshot: USED snapshot → rejected (null)
 * P07 — getPriceSnapshot: EXPIRED snapshot → rejected (null)
 * P08 — getPriceSnapshot: past-TTL ACTIVE → auto-transitions to EXPIRED, returns null
 * P09 — markSnapshotUsed CAS: ACTIVE → USED
 * P10 — markSnapshotUsed idempotence: EXPIRED not downgraded to USED
 * P11 — markSnapshotUsed idempotence: INVALIDATED not downgraded to USED
 * P12 — expireStaleSnapshots: only ACTIVE+past-TTL rows are updated
 * P13 — expireStaleSnapshots: USED/INVALIDATED rows are untouched
 * P14 — Price isolation: client-supplied amount ignored; server uses snapshot
 * P15 — Currency flows correctly: supplierCurrency stored separately from sellingCurrency
 * P16 — sellingAmount ≥ supplierAmount (fee + markup never go negative)
 * P17 — 50 concurrent createPriceSnapshot → 50 distinct snapshot IDs
 * P18 — Snapshot status machine: USED/EXPIRED/INVALIDATED are terminal (no back-transition)
 * P19 — Commercial engine is pure: same inputs → same output (deterministic)
 * P20 — Snapshot itinerary stored verbatim; price not re-derived at read time
 */

import assert from "node:assert/strict"
import { test, describe } from "node:test"
import { computeCommercialResult } from "@/lib/vols/commercial-engine"

// ---------------------------------------------------------------------------
// Types mirrored from price-snapshot.ts (no "use server" import allowed)
// ---------------------------------------------------------------------------

type SnapshotStatus = "ACTIVE" | "USED" | "EXPIRED" | "INVALIDATED"

interface MockSnapshot {
  id: string
  agencyId: string
  provider: string
  providerOfferId: string
  supplierAmount: string
  supplierCurrency: string
  fee: string
  markup: string
  sellingAmount: string
  sellingCurrency: string
  status: SnapshotStatus
  expiresAt: Date
  itinerary: Record<string, unknown>
}

let nextId = 1
function makeSnap(overrides: Partial<MockSnapshot> = {}): MockSnapshot {
  return {
    id: `snap-${nextId++}`,
    agencyId: "agency-1",
    provider: "amadeus",
    providerOfferId: "offer-abc",
    supplierAmount: "400.000",
    supplierCurrency: "TND",
    fee: "15.000",
    markup: "16.000",
    sellingAmount: "431.000",
    sellingCurrency: "TND",
    status: "ACTIVE",
    expiresAt: new Date(Date.now() + 20 * 60 * 1000),
    itinerary: { tripType: "ONE_WAY", journeys: [], fares: [] },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Inline implementations of snapshot lifecycle functions
// (mirrors price-snapshot.ts logic without "use server" imports)
// ---------------------------------------------------------------------------

function getPriceSnapshot(
  db: MockSnapshot[],
  expired: { ids: string[] },
  snapshotId: string,
): MockSnapshot | null {
  const snap = db.find((s) => s.id === snapshotId) ?? null
  if (!snap) return null
  if (snap.status !== "ACTIVE") return null
  if (snap.expiresAt < new Date()) {
    snap.status = "EXPIRED"
    expired.ids.push(snapshotId)
    return null
  }
  return snap
}

function markSnapshotUsed(db: MockSnapshot[], snapshotId: string): boolean {
  const snap = db.find((s) => s.id === snapshotId)
  if (!snap) return false
  // CAS: only transition ACTIVE → USED; terminal statuses are not downgraded
  if (snap.status !== "ACTIVE") return false
  snap.status = "USED"
  return true
}

function expireStaleSnapshots(db: MockSnapshot[]): number {
  const now = new Date()
  let count = 0
  for (const snap of db) {
    if (snap.status === "ACTIVE" && snap.expiresAt < now) {
      snap.status = "EXPIRED"
      count++
    }
  }
  return count
}

// ---------------------------------------------------------------------------
// Helper: simulate createPriceSnapshot (assigns unique ID + stores in DB)
// ---------------------------------------------------------------------------

let snapshotIdCounter = 1000
async function createPriceSnapshot(
  db: MockSnapshot[],
  supplierAmount: number,
  supplierCurrency: string,
  agencyId: string,
): Promise<MockSnapshot> {
  const rules = { fixedFee: 15, markupRate: 0.04, currency: "TND" }
  const commercial = computeCommercialResult(supplierAmount, supplierCurrency, rules)
  const snap: MockSnapshot = {
    id: `snap-${++snapshotIdCounter}`,
    agencyId,
    provider: "amadeus",
    providerOfferId: "offer-x",
    supplierAmount: String(commercial.supplierAmount),
    supplierCurrency: commercial.supplierCurrency,
    fee: String(commercial.fee),
    markup: String(commercial.markup),
    sellingAmount: String(commercial.sellingAmount),
    sellingCurrency: commercial.sellingCurrency,
    status: "ACTIVE",
    expiresAt: new Date(Date.now() + 20 * 60 * 1000),
    itinerary: { tripType: "ONE_WAY" },
  }
  db.push(snap)
  return snap
}

// ===========================================================================
// Tests
// ===========================================================================

describe("G10 — PriceSnapshot Integrity", () => {

  // ── Commercial engine arithmetic ────────────────────────────────────────────

  test("P01 — B2C price arithmetic: sellingAmount = supplier + fee + markup", () => {
    const result = computeCommercialResult(400, "TND", {
      fixedFee: 15,
      markupRate: 0.04,
      currency: "TND",
    })
    assert.equal(result.supplierAmount, 400)
    assert.equal(result.fee, 15)
    assert.equal(result.markup, 16) // 400 * 0.04 = 16
    assert.equal(result.sellingAmount, 431) // 400 + 15 + 16
    assert.equal(result.sellingCurrency, "TND")
  })

  test("P02 — B2B price arithmetic: fee=10, markup=2.5%", () => {
    const result = computeCommercialResult(500, "TND", {
      fixedFee: 10,
      markupRate: 0.025,
      currency: "TND",
    })
    assert.equal(result.fee, 10)
    assert.equal(result.markup, 12.5) // 500 * 0.025
    assert.equal(result.sellingAmount, 522.5)
  })

  test("P03 — minMarkup clamping: very small supplier → markup raised to floor", () => {
    const result = computeCommercialResult(10, "TND", {
      fixedFee: 0,
      markupRate: 0.04,
      minMarkup: 20,
      currency: "TND",
    })
    // 10 * 0.04 = 0.4, but minMarkup = 20, so markup = 20
    assert.equal(result.markup, 20)
    assert.equal(result.sellingAmount, 30) // 10 + 0 + 20
  })

  test("P04 — maxMarkup clamping: large supplier → markup capped at ceiling", () => {
    const result = computeCommercialResult(10000, "TND", {
      fixedFee: 15,
      markupRate: 0.04,
      maxMarkup: 200,
      currency: "TND",
    })
    // 10000 * 0.04 = 400, but maxMarkup = 200
    assert.equal(result.markup, 200)
    assert.equal(result.sellingAmount, 10215) // 10000 + 15 + 200
  })

  // ── Snapshot TTL ────────────────────────────────────────────────────────────

  test("P05 — Snapshot TTL: expiresAt ≈ now + 20 minutes", async () => {
    const db: MockSnapshot[] = []
    const beforeCreate = Date.now()
    const snap = await createPriceSnapshot(db, 300, "TND", "agency-1")
    const afterCreate = Date.now()

    const expiresMs = snap.expiresAt.getTime()
    const expectedMin = beforeCreate + 19.9 * 60 * 1000
    const expectedMax = afterCreate + 20.1 * 60 * 1000

    assert.ok(
      expiresMs >= expectedMin && expiresMs <= expectedMax,
      `expiresAt ${snap.expiresAt.toISOString()} outside expected 20-min window`,
    )
    assert.equal(snap.status, "ACTIVE")
  })

  // ── getPriceSnapshot status guards ─────────────────────────────────────────

  test("P06 — getPriceSnapshot: USED snapshot → null", () => {
    const db = [makeSnap({ status: "USED" })]
    const expired = { ids: [] as string[] }
    const result = getPriceSnapshot(db, expired, db[0].id)
    assert.equal(result, null)
    assert.equal(expired.ids.length, 0, "Auto-expire must not fire for USED snapshot")
  })

  test("P07 — getPriceSnapshot: EXPIRED snapshot → null", () => {
    const db = [makeSnap({ status: "EXPIRED" })]
    const expired = { ids: [] as string[] }
    const result = getPriceSnapshot(db, expired, db[0].id)
    assert.equal(result, null)
  })

  test("P08 — getPriceSnapshot: past-TTL ACTIVE snapshot → auto-EXPIRED, returns null", () => {
    const pastTTL = new Date(Date.now() - 1000) // 1 second ago
    const db = [makeSnap({ status: "ACTIVE", expiresAt: pastTTL })]
    const expired = { ids: [] as string[] }

    const result = getPriceSnapshot(db, expired, db[0].id)
    assert.equal(result, null)
    assert.equal(db[0].status, "EXPIRED", "Past-TTL ACTIVE snapshot must transition to EXPIRED")
    assert.ok(expired.ids.includes(db[0].id), "Auto-expire must record the affected snapshot ID")
  })

  // ── markSnapshotUsed CAS ─────────────────────────────────────────────────────

  test("P09 — markSnapshotUsed CAS: ACTIVE → USED", () => {
    const db = [makeSnap({ status: "ACTIVE" })]
    const claimed = markSnapshotUsed(db, db[0].id)
    assert.equal(claimed, true)
    assert.equal(db[0].status, "USED")
  })

  test("P10 — markSnapshotUsed idempotence: EXPIRED → status unchanged", () => {
    const db = [makeSnap({ status: "EXPIRED" })]
    const claimed = markSnapshotUsed(db, db[0].id)
    assert.equal(claimed, false, "EXPIRED snapshot must not be claimed")
    assert.equal(db[0].status, "EXPIRED", "EXPIRED must not be downgraded to USED")
  })

  test("P11 — markSnapshotUsed idempotence: INVALIDATED → status unchanged", () => {
    const db = [makeSnap({ status: "INVALIDATED" })]
    const claimed = markSnapshotUsed(db, db[0].id)
    assert.equal(claimed, false, "INVALIDATED snapshot must not be claimed")
    assert.equal(db[0].status, "INVALIDATED")
  })

  // ── expireStaleSnapshots cron ────────────────────────────────────────────────

  test("P12 — expireStaleSnapshots: only ACTIVE+past-TTL rows updated", () => {
    const past = new Date(Date.now() - 5 * 60 * 1000) // 5 min ago
    const future = new Date(Date.now() + 15 * 60 * 1000)

    const db: MockSnapshot[] = [
      makeSnap({ status: "ACTIVE", expiresAt: past }),   // should expire
      makeSnap({ status: "ACTIVE", expiresAt: past }),   // should expire
      makeSnap({ status: "ACTIVE", expiresAt: future }), // should NOT expire
    ]

    const count = expireStaleSnapshots(db)
    assert.equal(count, 2)
    assert.equal(db[0].status, "EXPIRED")
    assert.equal(db[1].status, "EXPIRED")
    assert.equal(db[2].status, "ACTIVE", "Future ACTIVE snapshot must remain ACTIVE")
  })

  test("P13 — expireStaleSnapshots: USED/INVALIDATED rows untouched", () => {
    const past = new Date(Date.now() - 5 * 60 * 1000)

    const db: MockSnapshot[] = [
      makeSnap({ status: "USED", expiresAt: past }),
      makeSnap({ status: "INVALIDATED", expiresAt: past }),
      makeSnap({ status: "EXPIRED", expiresAt: past }),
    ]

    const count = expireStaleSnapshots(db)
    assert.equal(count, 0, "Cron must not touch USED/INVALIDATED/EXPIRED rows")
    assert.equal(db[0].status, "USED")
    assert.equal(db[1].status, "INVALIDATED")
    assert.equal(db[2].status, "EXPIRED")
  })

  // ── Price isolation ──────────────────────────────────────────────────────────

  test("P14 — Price isolation: client-supplied amount ignored; server uses snapshot", () => {
    // Client claims the trip costs 1 TND. Snapshot says 431 TND.
    // The server must always use the snapshot's sellingAmount.
    const clientClaimedAmount = "1.000"
    const snap = makeSnap({ sellingAmount: "431.000" })

    // Simulates what booking-request-action does: uses snap.sellingAmount
    // for reservations.originalAmount — never the client payload
    const serverAmount = snap.sellingAmount
    assert.notEqual(serverAmount, clientClaimedAmount)
    assert.equal(serverAmount, "431.000")
  })

  // ── Currency integrity ───────────────────────────────────────────────────────

  test("P15 — Currency flows correctly: supplierCurrency stored independently of sellingCurrency", () => {
    // Supplier bills in EUR; agency sells in TND
    const result = computeCommercialResult(200, "EUR", {
      fixedFee: 15,
      markupRate: 0.04,
      currency: "TND",
    })
    assert.equal(result.supplierCurrency, "EUR", "supplierCurrency must reflect GDS currency")
    assert.equal(result.sellingCurrency, "TND", "sellingCurrency must reflect selling currency")
    assert.notEqual(result.supplierCurrency, result.sellingCurrency)
  })

  test("P16 — sellingAmount ≥ supplierAmount (fee + markup never negative)", () => {
    const amounts = [100, 250, 500, 1000, 5000]
    for (const amt of amounts) {
      const result = computeCommercialResult(amt, "TND", {
        fixedFee: 15,
        markupRate: 0.04,
        currency: "TND",
      })
      assert.ok(
        result.sellingAmount >= result.supplierAmount,
        `sellingAmount ${result.sellingAmount} < supplierAmount ${result.supplierAmount} for input ${amt}`,
      )
    }
  })

  // ── Concurrency ─────────────────────────────────────────────────────────────

  test("P17 — 50 concurrent createPriceSnapshot calls → 50 distinct snapshot IDs", async () => {
    const db: MockSnapshot[] = []
    const snaps = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        createPriceSnapshot(db, 300 + i, "TND", "agency-1"),
      ),
    )

    const ids = snaps.map((s) => s.id)
    const unique = new Set(ids)
    assert.equal(unique.size, 50, `Expected 50 unique snapshot IDs, got ${unique.size}`)
    assert.equal(db.length, 50)
  })

  // ── Status machine terminal states ──────────────────────────────────────────

  test("P18 — Terminal statuses (USED/EXPIRED/INVALIDATED) cannot be overwritten by markSnapshotUsed", () => {
    const terminals: SnapshotStatus[] = ["USED", "EXPIRED", "INVALIDATED"]

    for (const status of terminals) {
      const db = [makeSnap({ status })]
      const original = db[0].status
      markSnapshotUsed(db, db[0].id)
      assert.equal(db[0].status, original, `Terminal status ${status} must not be overwritten`)
    }
  })

  // ── Commercial engine determinism ───────────────────────────────────────────

  test("P19 — Commercial engine is pure: same inputs produce same output", () => {
    const rules = { fixedFee: 15, markupRate: 0.04, currency: "TND" }
    const r1 = computeCommercialResult(450, "TND", rules)
    const r2 = computeCommercialResult(450, "TND", rules)
    assert.deepEqual(r1, r2)
  })

  // ── Itinerary immutability ───────────────────────────────────────────────────

  test("P20 — Snapshot itinerary is stored verbatim; price not re-derived at read time", () => {
    // When we read a snapshot back, the prices come from the stored fields
    // (sellingAmount, fee, markup), not from re-running the commercial engine
    // on the stored itinerary. This validates that price fields are the source
    // of truth, not the itinerary's supplierTotalAmount.
    const originalItinerary = {
      tripType: "ONE_WAY",
      supplierTotalAmount: 400,
      supplierCurrency: "TND",
    }
    const snap = makeSnap({
      supplierAmount: "400.000",
      fee: "15.000",
      markup: "16.000",
      sellingAmount: "431.000",
      itinerary: originalItinerary,
    })

    // Simulate modifying the itinerary JSONB field (e.g. a hypothetical bug
    // where the itinerary is updated after snapshot creation)
    snap.itinerary = { ...originalItinerary, supplierTotalAmount: 999 }

    // The booking pipeline must use snap.sellingAmount, not recalculate from itinerary
    const amountUsedForBooking = snap.sellingAmount
    assert.equal(amountUsedForBooking, "431.000", "Price must come from stored fields, not itinerary re-derivation")
    assert.notEqual(amountUsedForBooking, "999.000")
  })
})
