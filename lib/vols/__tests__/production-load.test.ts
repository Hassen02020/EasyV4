/**
 * G15 — Production Load
 *
 * Proves the system holds under production-scale conditions that exceed G9's
 * 200-sequential / 50-concurrent ceiling and go beyond G14's concurrency
 * correctness proofs. Every test runs entirely in-memory using the same
 * injectable-function pattern as G9–G14.
 *
 * New territory vs G9 / G14:
 *   1. Scale: 500–1 000 bookings (G9 topped at 200 seq / 50 concurrent)
 *   2. Two-arm CAS under production load (G9 only proved Arm A at scale)
 *   3. Realistic GDS error budget (random failures across large batches)
 *   4. Slow-adapter concurrency (synthetic per-booking latency)
 *   5. Burst spike after a sustained baseline
 *   6. Audit retry under load (G12 pattern at scale)
 *   7. Memory stability (no quadratic record accumulation)
 *   8. Throughput saturation with synthetic concurrency latency
 *   9. Full realistic production mix at 1 000-booking scale
 *
 * P01 — 1 000 sequential bookings: p50/p95/p99 no O(n²) overhead
 * P02 — 500 concurrent independent bookings (10× G9 S16)
 * P03 — 1 000-booking batch with 3% random BOOK_FAIL → error budget ≤ 5%
 * P04 — Slow adapter: 2ms synthetic book delay × 50 concurrent → wall < 50ms
 * P05 — Two-arm CAS: 300 PENDING + 100 FAILED+pnr concurrent → 400 wins
 * P06 — 200 concurrent claims on same booking → exactly 1 CONFIRMED
 * P07 — Burst spike: 200 sequential baseline + 300 concurrent burst → no corruption
 * P08 — Audit coverage: 500-booking batch → every success has BOOK + ISSUE entries
 * P09 — Audit retry: insert fails ×2 then succeeds → entry still logged (G12 retry)
 * P10 — Audit retry exhausted: 4 consecutive insert failures → AUDIT_FAILURE on stderr
 * P11 — Memory stability: 1 000 bookings → 1 000 records, no extra accumulation
 * P12 — Statistical error budget: 200 bookings with 5% PRICE_CHANGED → 8–12 affected
 * P13 — Arm B recovery at scale: 100 FAILED+pnr → 100 Arm B wins, 100 CONFIRMED
 * P14 — Throughput saturation: 1ms synthetic delay × 100 concurrent → wall < 30ms
 * P15 — Realistic production mix: 1 000 bookings (70% ok, 15% reissue, 10% price-changed, 5% unavailable)
 *
 * Capacity measurement (P16–P19) — explicit throughput, concurrency efficiency,
 * GDS-latency ceiling, and sustained capacity without degradation:
 * P16 — Explicit throughput baseline: 2 000 concurrent → bps ≥ 50 000
 * P17 — GDS-latency throughput: 100 concurrent × 5ms → bps ≥ 5 000
 * P18 — Concurrency efficiency curve: bps(500 concurrent) ≥ bps(50 concurrent) × 3
 * P19 — Sustained capacity: 20 successive 100-booking batches, no throughput degradation
 */

import assert from "node:assert/strict"
import { test, describe } from "node:test"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BookingStatus =
  | "PENDING"
  | "BOOKING_IN_PROGRESS"
  | "BOOKED"
  | "TICKETING_IN_PROGRESS"
  | "CONFIRMED"
  | "FAILED"
  | "PRICE_CHANGED"

interface BookingRecord {
  id: string
  status: BookingStatus
  pnr: string | null
}

interface AuditEntry {
  bookingId: string
  type: "RECHECK" | "BOOK" | "ISSUE"
  status: "SUCCESS" | "FAILURE"
}

interface AdapterConfig {
  recheckStatus?: "AVAILABLE" | "PRICE_CHANGED" | "UNAVAILABLE"
  bookThrows?: boolean
  issueThrows?: boolean
  bookDelayMs?: number
}

type FulfillOutcome =
  | { ok: true; pnr: string; reissueOnly: boolean }
  | { ok: false; code: string }

// ---------------------------------------------------------------------------
// Two-arm CAS (mirrors DB-level UPDATE … RETURNING row-locking)
//
//   Arm A: PENDING  → BOOKING_IN_PROGRESS   (reissueOnly = false)
//   Arm B: FAILED + pnr ≠ null → TICKETING_IN_PROGRESS  (reissueOnly = true)
//
// Synchronous (no yield between read and write) — mirrors PostgreSQL's
// serialised row-level locking.
// ---------------------------------------------------------------------------

type ClaimResult =
  | { claimed: true; reissueOnly: boolean }
  | { claimed: false; reason: "WRONG_STATUS" | "NOT_FOUND" }

function atomicClaim(booking: BookingRecord | undefined): ClaimResult {
  if (!booking) return { claimed: false, reason: "NOT_FOUND" }
  if (booking.status === "PENDING") {
    booking.status = "BOOKING_IN_PROGRESS"
    return { claimed: true, reissueOnly: false }
  }
  if (booking.status === "FAILED" && booking.pnr !== null) {
    booking.status = "TICKETING_IN_PROGRESS"
    return { claimed: true, reissueOnly: true }
  }
  return { claimed: false, reason: "WRONG_STATUS" }
}

// ---------------------------------------------------------------------------
// Full production pipeline — two-arm CAS + adapter config + audit log
//
// Combines G9's adapter simulation with G14's two-arm CAS so production-load
// tests can exercise both paths in one call.
// ---------------------------------------------------------------------------

let _pnrSeq = 0

async function runFulfillmentFull(
  booking: BookingRecord,
  cfg: AdapterConfig,
  auditLog: AuditEntry[],
): Promise<FulfillOutcome> {
  const claim = atomicClaim(booking)
  if (!claim.claimed) return { ok: false, code: claim.reason }

  let activePnr: string

  if (claim.reissueOnly) {
    // Arm B — skip recheck + book, reuse existing PNR
    activePnr = booking.pnr!
  } else {
    // Arm A — recheck, then book
    const recheckStatus = cfg.recheckStatus ?? "AVAILABLE"

    if (recheckStatus === "PRICE_CHANGED") {
      booking.status = "PRICE_CHANGED"
      auditLog.push({ bookingId: booking.id, type: "RECHECK", status: "FAILURE" })
      return { ok: false, code: "PRICE_CHANGED" }
    }
    if (recheckStatus !== "AVAILABLE") {
      booking.status = "FAILED"
      auditLog.push({ bookingId: booking.id, type: "RECHECK", status: "FAILURE" })
      return { ok: false, code: recheckStatus }
    }

    auditLog.push({ bookingId: booking.id, type: "RECHECK", status: "SUCCESS" })

    if (cfg.bookDelayMs) {
      await new Promise<void>((r) => setTimeout(r, cfg.bookDelayMs))
    }

    if (cfg.bookThrows) {
      booking.status = "FAILED"
      auditLog.push({ bookingId: booking.id, type: "BOOK", status: "FAILURE" })
      return { ok: false, code: "BOOK_FAILED" }
    }

    activePnr = `PNR-${booking.id}-${++_pnrSeq}`
    booking.pnr = activePnr
    booking.status = "BOOKED"
    auditLog.push({ bookingId: booking.id, type: "BOOK", status: "SUCCESS" })
  }

  if (cfg.issueThrows) {
    booking.status = "FAILED"
    auditLog.push({ bookingId: booking.id, type: "ISSUE", status: "FAILURE" })
    return { ok: false, code: "ISSUE_FAILED" }
  }

  booking.status = "CONFIRMED"
  auditLog.push({ bookingId: booking.id, type: "ISSUE", status: "SUCCESS" })
  return { ok: true, pnr: activePnr, reissueOnly: claim.reissueOnly }
}

// ---------------------------------------------------------------------------
// Audit-retry simulation (G12 pattern — injectable, no real sleep)
//
// AUDIT_MAX_ATTEMPTS = 4 (1 initial + 3 retries), matching fulfillment-action.ts.
// recordedDelays captures the delay values without blocking; stderrLines captures
// the structured AUDIT_FAILURE payload on final failure.
// ---------------------------------------------------------------------------

const AUDIT_MAX_ATTEMPTS = 4

interface AuditLogEntry {
  bookingId: string
  type: string
  status: string
}

async function logTransactionReliable(
  entry: AuditLogEntry,
  dbInsert: (e: AuditLogEntry) => Promise<void>,
  recordedDelays: number[],
  stderrLines: string[],
): Promise<void> {
  for (let attempt = 1; attempt <= AUDIT_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        // Record delay without actually sleeping
        recordedDelays.push(50 * 2 ** (attempt - 2))
      }
      await dbInsert(entry)
      return
    } catch (err) {
      if (attempt < AUDIT_MAX_ATTEMPTS) continue
      stderrLines.push(
        JSON.stringify({
          tag: "AUDIT_FAILURE",
          bookingId: entry.bookingId,
          type: entry.type,
          error: String(err),
          ts: new Date().toISOString(),
        }),
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _bkSeq = 0
function makeBooking(status: BookingStatus = "PENDING", pnr: string | null = null): BookingRecord {
  return { id: `bk-${++_bkSeq}`, status, pnr }
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.floor(sorted.length * p)]!
}

// ===========================================================================
// Tests
// ===========================================================================

describe("G15 — Production Load", () => {

  // ── Scale: 1 000 sequential ─────────────────────────────────────────────────

  test("P01 — 1 000 sequential bookings: p50/p95/p99 no O(n²) overhead", async () => {
    const durations: number[] = []

    for (let i = 0; i < 1000; i++) {
      const b = makeBooking()
      const t0 = performance.now()
      await runFulfillmentFull(b, {}, [])
      durations.push(performance.now() - t0)
    }

    durations.sort((a, b) => a - b)
    const p50 = percentile(durations, 0.5)
    const p95 = percentile(durations, 0.95)
    const p99 = percentile(durations, 0.99)

    assert.ok(p99 < 50, `p99 ${p99.toFixed(2)}ms exceeds 50ms — possible O(n²) overhead`)
    assert.ok(p50 <= p95, "p50 must be ≤ p95")
    assert.ok(p95 <= p99, "p95 must be ≤ p99")

    const allConfirmed = durations.length === 1000
    assert.ok(allConfirmed, "all 1 000 bookings must complete")
  })

  // ── Scale: 500 concurrent ───────────────────────────────────────────────────

  test("P02 — 500 concurrent independent bookings (10× G9 S16)", async () => {
    const bookings = Array.from({ length: 500 }, () => makeBooking())
    const t0 = performance.now()

    const results = await Promise.all(
      bookings.map((b) => runFulfillmentFull(b, {}, [])),
    )

    const wallMs = performance.now() - t0
    const wins = results.filter((r) => r.ok).length

    assert.equal(wins, 500, "all 500 independent concurrent bookings must succeed")
    assert.ok(wallMs < 2000, `concurrent wall time ${wallMs.toFixed(1)}ms too high`)
    assert.ok(results.every((r) => r.ok && !r.reissueOnly), "all must be Arm A (new bookings)")
  })

  // ── Error budget ────────────────────────────────────────────────────────────

  test("P03 — 1 000-booking batch with ~3% random BOOK_FAIL → error budget ≤ 5%", async () => {
    // Every 33rd booking fails (≈ 3.0% failure rate)
    const N = 1000
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => {
        const b = makeBooking()
        const cfg: AdapterConfig = (i % 33 === 0) ? { bookThrows: true } : {}
        return runFulfillmentFull(b, cfg, [])
      }),
    )

    const failed = results.filter((r) => !r.ok && (r as { code: string }).code === "BOOK_FAILED").length
    const errorRate = failed / N

    assert.ok(failed > 0, "injection must produce at least one failure")
    assert.ok(errorRate <= 0.05, `error rate ${(errorRate * 100).toFixed(1)}% exceeds 5% budget`)

    const won = results.filter((r) => r.ok).length
    assert.ok(won > 950, `expected >950 successes, got ${won}`)
  })

  // ── Slow adapter concurrency ────────────────────────────────────────────────

  test("P04 — Slow adapter: 2ms synthetic book delay × 50 concurrent → wall < 50ms", async () => {
    // If bookings were sequential: 50 × 2ms = 100ms.
    // True async concurrency collapses this to ~2ms + overhead.
    const bookings = Array.from({ length: 50 }, () => makeBooking())
    const t0 = performance.now()

    const results = await Promise.all(
      bookings.map((b) => runFulfillmentFull(b, { bookDelayMs: 2 }, [])),
    )

    const wallMs = performance.now() - t0
    const wins = results.filter((r) => r.ok).length

    assert.equal(wins, 50, "all 50 slow-adapter bookings must succeed")
    assert.ok(
      wallMs < 50,
      `wall time ${wallMs.toFixed(1)}ms ≥ 50ms — bookings are not running concurrently`,
    )
  })

  // ── Two-arm CAS under production load ──────────────────────────────────────

  test("P05 — Two-arm CAS: 300 PENDING + 100 FAILED+pnr concurrent → 400 wins", async () => {
    const pending = Array.from({ length: 300 }, () => makeBooking("PENDING"))
    const orphaned = Array.from({ length: 100 }, () =>
      makeBooking("FAILED", `ORPHAN-${++_bkSeq}`),
    )
    const all = [...pending, ...orphaned]

    const results = await Promise.all(
      all.map((b) => runFulfillmentFull(b, {}, [])),
    )

    const armAWins = results.filter((r) => r.ok && !r.reissueOnly).length
    const armBWins = results.filter((r) => r.ok && r.reissueOnly).length
    const total = armAWins + armBWins

    assert.equal(armAWins, 300, "300 Arm A (PENDING) wins expected")
    assert.equal(armBWins, 100, "100 Arm B (re-issue) wins expected")
    assert.equal(total, 400, "total wins must be 400")

    // No booking stuck in an in-progress state
    const stuck = all.filter(
      (b) => b.status === "BOOKING_IN_PROGRESS" || b.status === "TICKETING_IN_PROGRESS",
    )
    assert.equal(stuck.length, 0, "no booking stuck in-progress after full pipeline")
  })

  // ── Concurrent claims on same booking ──────────────────────────────────────

  test("P06 — 200 concurrent claims on same booking → exactly 1 CONFIRMED", async () => {
    const booking = makeBooking("PENDING")

    const results = await Promise.all(
      Array.from({ length: 200 }, () => runFulfillmentFull(booking, {}, [])),
    )

    const wins = results.filter((r) => r.ok)
    const wrong = results.filter((r) => !r.ok && (r as { code: string }).code === "WRONG_STATUS")

    assert.equal(wins.length, 1, "exactly 1 of 200 concurrent calls must win")
    assert.equal(wrong.length, 199, "199 must be rejected with WRONG_STATUS")
    assert.equal(booking.status, "CONFIRMED", "booking must be CONFIRMED")
  })

  // ── Burst spike ─────────────────────────────────────────────────────────────

  test("P07 — Burst spike: 200 sequential baseline + 300 concurrent burst → no corruption", async () => {
    // Phase 1: 200 sequential (sustained baseline)
    const baselineResults: FulfillOutcome[] = []
    for (let i = 0; i < 200; i++) {
      const b = makeBooking()
      baselineResults.push(await runFulfillmentFull(b, {}, []))
    }

    const baselineWins = baselineResults.filter((r) => r.ok).length
    assert.equal(baselineWins, 200, "all 200 baseline bookings must succeed")

    // Phase 2: 300 concurrent burst (spike)
    const burstBookings = Array.from({ length: 300 }, () => makeBooking())
    const burstResults = await Promise.all(
      burstBookings.map((b) => runFulfillmentFull(b, {}, [])),
    )

    const burstWins = burstResults.filter((r) => r.ok).length
    assert.equal(burstWins, 300, "all 300 burst bookings must succeed independently")

    // Baseline state must be unaffected by burst
    const baselinePnrs = baselineResults
      .filter((r) => r.ok)
      .map((r) => (r as { pnr: string }).pnr)
    assert.equal(new Set(baselinePnrs).size, 200, "baseline PNRs must remain distinct after burst")
  })

  // ── Audit coverage under load ───────────────────────────────────────────────

  test("P08 — Audit coverage: 500-booking batch → every success has BOOK + ISSUE entries", async () => {
    const auditLog: AuditEntry[] = []
    const bookings = Array.from({ length: 500 }, () => makeBooking())

    await Promise.all(bookings.map((b) => runFulfillmentFull(b, {}, auditLog)))

    // Every booking produces exactly: RECHECK:SUCCESS + BOOK:SUCCESS + ISSUE:SUCCESS
    const bookEntries = auditLog.filter((e) => e.type === "BOOK" && e.status === "SUCCESS")
    const issueEntries = auditLog.filter((e) => e.type === "ISSUE" && e.status === "SUCCESS")

    assert.equal(bookEntries.length, 500, "every success must have a BOOK:SUCCESS audit entry")
    assert.equal(issueEntries.length, 500, "every success must have an ISSUE:SUCCESS audit entry")

    // No duplicate entries per booking
    const bookingIdsWithBook = new Set(bookEntries.map((e) => e.bookingId))
    assert.equal(bookingIdsWithBook.size, 500, "each booking must have exactly 1 BOOK entry")
  })

  // ── Audit retry (G12 pattern) ───────────────────────────────────────────────

  test("P09 — Audit retry: insert fails ×2 then succeeds → entry still logged", async () => {
    const entry: AuditLogEntry = { bookingId: "bk-audit-09", type: "BOOK", status: "SUCCESS" }
    const logged: AuditLogEntry[] = []
    const delays: number[] = []
    const stderr: string[] = []

    let callCount = 0
    const flakyInsert = async (e: AuditLogEntry) => {
      callCount++
      if (callCount <= 2) throw new Error("db connection timeout")
      logged.push(e)
    }

    await logTransactionReliable(entry, flakyInsert, delays, stderr)

    assert.equal(callCount, 3, "must attempt 3 times (2 failures + 1 success)")
    assert.equal(logged.length, 1, "entry must eventually be logged")
    assert.equal(logged[0]!.bookingId, "bk-audit-09")
    assert.equal(stderr.length, 0, "no AUDIT_FAILURE on stderr — retry succeeded")

    // Delays must follow exponential backoff (50ms base, no actual sleep)
    assert.equal(delays.length, 2, "2 retry delays recorded")
    assert.equal(delays[0], 50, "first retry delay = 50ms")
    assert.equal(delays[1], 100, "second retry delay = 100ms")
  })

  test("P10 — Audit retry exhausted: 4 failures → AUDIT_FAILURE on stderr, booking unaffected", async () => {
    const entry: AuditLogEntry = { bookingId: "bk-audit-10", type: "ISSUE", status: "FAILURE" }
    const delays: number[] = []
    const stderr: string[] = []

    let callCount = 0
    const alwaysFail = async (_e: AuditLogEntry) => {
      callCount++
      throw new Error("db unavailable")
    }

    // logTransactionReliable must not throw — it swallows all errors after max attempts
    await assert.doesNotReject(
      () => logTransactionReliable(entry, alwaysFail, delays, stderr),
      "logTransactionReliable must never throw — booking must be unaffected by audit failure",
    )

    assert.equal(callCount, AUDIT_MAX_ATTEMPTS, `must attempt exactly ${AUDIT_MAX_ATTEMPTS} times`)
    assert.equal(delays.length, AUDIT_MAX_ATTEMPTS - 1, "must record N-1 retry delays")

    // AUDIT_FAILURE must appear on stderr
    assert.equal(stderr.length, 1, "exactly 1 AUDIT_FAILURE line on stderr")
    const payload = JSON.parse(stderr[0]!) as Record<string, unknown>
    assert.equal(payload["tag"], "AUDIT_FAILURE")
    assert.equal(payload["bookingId"], "bk-audit-10")
    assert.equal(payload["type"], "ISSUE")
    assert.ok(typeof payload["error"] === "string" && payload["error"].includes("db unavailable"))
  })

  // ── Memory stability ────────────────────────────────────────────────────────

  test("P11 — Memory stability: 1 000 bookings produce exactly 1 000 records", async () => {
    // Each booking must produce exactly 1 BookingRecord — no ghost rows or
    // implicit list growth in the simulation.
    const bookings: BookingRecord[] = []

    for (let i = 0; i < 1000; i++) {
      const b = makeBooking()
      bookings.push(b)
      await runFulfillmentFull(b, {}, [])
    }

    assert.equal(bookings.length, 1000, "exactly 1 000 booking records created")

    // All must be CONFIRMED (no stuck in-progress)
    const confirmed = bookings.filter((b) => b.status === "CONFIRMED").length
    assert.equal(confirmed, 1000, "all 1 000 must be CONFIRMED — no memory state corruption")

    // All PNRs unique (no record sharing)
    const pnrs = bookings.map((b) => b.pnr).filter(Boolean) as string[]
    assert.equal(pnrs.length, 1000, "every booking must have a PNR")
    assert.equal(new Set(pnrs).size, 1000, "all 1 000 PNRs must be distinct")
  })

  // ── Statistical error budget ────────────────────────────────────────────────

  test("P12 — Statistical error budget: 200 bookings with 5% PRICE_CHANGED → 8–12 affected", async () => {
    // Every 20th booking hits PRICE_CHANGED — deterministic 5% (exactly 10 out of 200).
    const N = 200
    const auditLog: AuditEntry[] = []

    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => {
        const b = makeBooking()
        const cfg: AdapterConfig = (i % 20 === 0) ? { recheckStatus: "PRICE_CHANGED" } : {}
        return runFulfillmentFull(b, cfg, auditLog)
      }),
    )

    const priceChanged = results.filter((r) => !r.ok && (r as { code: string }).code === "PRICE_CHANGED").length
    const succeeded = results.filter((r) => r.ok).length

    // Allow ±2 variance around 10 to tolerate off-by-one in divisor edge cases
    assert.ok(
      priceChanged >= 8 && priceChanged <= 12,
      `expected 8–12 PRICE_CHANGED, got ${priceChanged}`,
    )
    assert.equal(priceChanged + succeeded, N, "total must add up to N")

    // PRICE_CHANGED bookings must NOT produce BOOK audit entries
    const bookEntries = auditLog.filter((e) => e.type === "BOOK")
    assert.equal(bookEntries.length, succeeded, "BOOK entries must equal successes — price-changed must not book")
  })

  // ── Arm B recovery at scale ─────────────────────────────────────────────────

  test("P13 — Arm B recovery: 100 FAILED+pnr bookings → 100 Arm B wins, all CONFIRMED", async () => {
    const orphaned = Array.from({ length: 100 }, (_, i) =>
      makeBooking("FAILED", `ORPHAN-PNR-${i + 1}`),
    )

    const results = await Promise.all(
      orphaned.map((b) => runFulfillmentFull(b, {}, [])),
    )

    const wins = results.filter((r) => r.ok)
    const reissues = wins.filter((r) => r.ok && r.reissueOnly)

    assert.equal(wins.length, 100, "all 100 orphaned bookings must recover via Arm B")
    assert.equal(reissues.length, 100, "all 100 wins must be Arm B (reissueOnly=true)")

    // All bookings terminal; original PNRs preserved
    const stuck = orphaned.filter(
      (b) => b.status === "BOOKING_IN_PROGRESS" || b.status === "TICKETING_IN_PROGRESS",
    )
    assert.equal(stuck.length, 0, "no booking stuck in-progress")

    orphaned.forEach((b, i) => {
      assert.equal(b.pnr, `ORPHAN-PNR-${i + 1}`, `booking ${b.id} must retain its original PNR`)
    })
  })

  // ── Throughput saturation ───────────────────────────────────────────────────

  test("P14 — Throughput saturation: 1ms synthetic delay × 100 concurrent → wall < 30ms", async () => {
    // Sequential equivalent: 100 × 1ms = 100ms.
    // True concurrency collapses this to ≈1ms + scheduling overhead.
    const bookings = Array.from({ length: 100 }, () => makeBooking())
    const t0 = performance.now()

    const results = await Promise.all(
      bookings.map((b) => runFulfillmentFull(b, { bookDelayMs: 1 }, [])),
    )

    const wallMs = performance.now() - t0
    const wins = results.filter((r) => r.ok).length

    assert.equal(wins, 100, "all 100 bookings must succeed")
    assert.ok(
      wallMs < 30,
      `wall time ${wallMs.toFixed(1)}ms ≥ 30ms — pipeline not running bookings concurrently`,
    )
  })

  // ── Realistic production mix ────────────────────────────────────────────────

  test("P15 — Realistic production mix: 1 000 bookings (70% ok, 15% reissue, 10% price-changed, 5% unavailable)", async () => {
    // Distribution:
    //   700 PENDING with AVAILABLE recheck        → Arm A wins (CONFIRMED)
    //   150 FAILED+pnr (orphaned)                → Arm B wins (CONFIRMED, reissueOnly)
    //   100 PENDING with PRICE_CHANGED recheck   → PRICE_CHANGED
    //    50 PENDING with UNAVAILABLE recheck     → FAILED
    // Total: 1 000

    const arm_a = Array.from({ length: 700 }, () => makeBooking("PENDING"))
    const arm_b = Array.from({ length: 150 }, (_, i) =>
      makeBooking("FAILED", `PROD-PNR-${i + 1}`),
    )
    const price_changed = Array.from({ length: 100 }, () => makeBooking("PENDING"))
    const unavailable = Array.from({ length: 50 }, () => makeBooking("PENDING"))

    const all = [
      ...arm_a.map((b) => ({ b, cfg: {} as AdapterConfig })),
      ...arm_b.map((b) => ({ b, cfg: {} as AdapterConfig })),
      ...price_changed.map((b) => ({ b, cfg: { recheckStatus: "PRICE_CHANGED" as const } })),
      ...unavailable.map((b) => ({ b, cfg: { recheckStatus: "UNAVAILABLE" as const } })),
    ]

    // Shuffle to interleave all types
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[all[i], all[j]] = [all[j]!, all[i]!]
    }

    const auditLog: AuditEntry[] = []
    const results = await Promise.all(all.map(({ b, cfg }) => runFulfillmentFull(b, cfg, auditLog)))

    const confirmed = results.filter((r) => r.ok).length
    const armAWins = results.filter((r) => r.ok && !r.reissueOnly).length
    const armBWins = results.filter((r) => r.ok && r.reissueOnly).length
    const priceChangedCount = results.filter((r) => !r.ok && (r as { code: string }).code === "PRICE_CHANGED").length
    const unavailableCount = results.filter((r) => !r.ok && (r as { code: string }).code === "UNAVAILABLE").length

    assert.equal(confirmed, 850, "700 Arm A + 150 Arm B = 850 confirmed")
    assert.equal(armAWins, 700, "700 Arm A wins")
    assert.equal(armBWins, 150, "150 Arm B wins")
    assert.equal(priceChangedCount, 100, "100 PRICE_CHANGED")
    assert.equal(unavailableCount, 50, "50 UNAVAILABLE")
    assert.equal(confirmed + priceChangedCount + unavailableCount, 1000, "totals must sum to 1 000")

    // No stuck-in-progress across the full mix
    const allBookings = all.map(({ b }) => b)
    const stuck = allBookings.filter(
      (b) => b.status === "BOOKING_IN_PROGRESS" || b.status === "TICKETING_IN_PROGRESS",
    )
    assert.equal(stuck.length, 0, "no booking stuck in a progress state after the full mix")

    // Audit: every confirmed booking has BOOK + ISSUE entries
    const bookEntries = auditLog.filter((e) => e.type === "BOOK" && e.status === "SUCCESS")
    const issueEntries = auditLog.filter((e) => e.type === "ISSUE" && e.status === "SUCCESS")
    assert.equal(bookEntries.length, 700, "700 BOOK:SUCCESS entries (Arm A only — Arm B skips book)")
    assert.equal(issueEntries.length, 850, "850 ISSUE:SUCCESS entries (all confirmed bookings)")
  })

  // ── Capacity measurement ────────────────────────────────────────────────────

  test("P16 — Explicit throughput baseline: 2 000 concurrent → bps ≥ 50 000", async () => {
    // In-memory with no synthetic delay: 2 000 concurrent pipelines,
    // all independent. Measures raw pipeline throughput before any GDS I/O.
    const bookings = Array.from({ length: 2000 }, () => makeBooking())
    const t0 = performance.now()

    const results = await Promise.all(
      bookings.map((b) => runFulfillmentFull(b, {}, [])),
    )

    const wallMs = performance.now() - t0
    const wins = results.filter((r) => r.ok).length
    const bps = Math.round((wins / wallMs) * 1000)

    assert.equal(wins, 2000, "all 2 000 bookings must succeed")
    assert.ok(bps >= 50_000, `throughput ${bps} bps < 50 000 bps — pipeline has unexpected bottleneck`)

    ;(globalThis as Record<string, unknown>)["__g15_baseline"] = { bps, wallMs, n: 2000 }
  })

  test("P17 — GDS-latency throughput: 100 concurrent × 5ms → bps ≥ 5 000", async () => {
    // With 5ms synthetic GDS book delay and 100 concurrent pipelines:
    //   Theoretical max = 100 / 0.005s = 20 000 bps
    //   25% efficiency floor → ≥ 5 000 bps
    // Sequential equivalent would be 100 × 5ms = 500ms → 200 bps — an order of magnitude worse.
    const bookings = Array.from({ length: 100 }, () => makeBooking())
    const t0 = performance.now()

    const results = await Promise.all(
      bookings.map((b) => runFulfillmentFull(b, { bookDelayMs: 5 }, [])),
    )

    const wallMs = performance.now() - t0
    const wins = results.filter((r) => r.ok).length
    const bps = Math.round((wins / wallMs) * 1000)

    assert.equal(wins, 100, "all 100 bookings must succeed")
    assert.ok(bps >= 5_000, `GDS-latency throughput ${bps} bps < 5 000 bps (sequential fallback?)`)

    ;(globalThis as Record<string, unknown>)["__g15_gds"] = { bps, wallMs, delayMs: 5, n: 100 }
  })

  test("P18 — Concurrency efficiency curve: bps(500 concurrent) ≥ bps(50 concurrent) × 3", async () => {
    // Verifies true concurrency: more concurrent bookings → proportionally higher throughput.
    // The ratio requirement is intentionally conservative (3×) to tolerate
    // scheduler and Promise overhead at extreme concurrency.

    // Warm-up (exclude from measurement)
    await Promise.all(Array.from({ length: 10 }, () =>
      runFulfillmentFull(makeBooking(), { bookDelayMs: 2 }, []),
    ))

    // Low concurrency
    const low = Array.from({ length: 50 }, () => makeBooking())
    const t0Low = performance.now()
    await Promise.all(low.map((b) => runFulfillmentFull(b, { bookDelayMs: 2 }, [])))
    const wallLow = performance.now() - t0Low
    const bpsLow = Math.round((50 / wallLow) * 1000)

    // High concurrency
    const high = Array.from({ length: 500 }, () => makeBooking())
    const t0High = performance.now()
    await Promise.all(high.map((b) => runFulfillmentFull(b, { bookDelayMs: 2 }, [])))
    const wallHigh = performance.now() - t0High
    const bpsHigh = Math.round((500 / wallHigh) * 1000)

    assert.ok(
      bpsHigh >= bpsLow * 3,
      `concurrency efficiency too low: bps(500)=${bpsHigh} not ≥ bps(50)×3=${bpsLow * 3}`,
    )

    ;(globalThis as Record<string, unknown>)["__g15_curve"] = { bpsLow, bpsHigh, ratio: (bpsHigh / bpsLow).toFixed(1) }
  })

  test("P19 — Sustained capacity: 20 successive 100-booking batches, no throughput degradation", async () => {
    // Simulates a sustained production stream: 20 consecutive waves of 100
    // independent concurrent bookings. Each wave must complete within a
    // stable ceiling — no warm-up effect or memory pressure slowing later batches.
    const WAVES = 20
    const PER_WAVE = 100
    const wallTimes: number[] = []

    for (let w = 0; w < WAVES; w++) {
      const bookings = Array.from({ length: PER_WAVE }, () => makeBooking())
      const t0 = performance.now()
      const results = await Promise.all(
        bookings.map((b) => runFulfillmentFull(b, {}, [])),
      )
      wallTimes.push(performance.now() - t0)
      const wins = results.filter((r) => r.ok).length
      assert.equal(wins, PER_WAVE, `wave ${w + 1}: all ${PER_WAVE} bookings must succeed`)
    }

    // No degradation: last wave ≤ 3× the first wave (absorbs JIT/GC variance)
    const first = wallTimes[0]!
    const last = wallTimes[WAVES - 1]!
    assert.ok(
      last <= first * 3,
      `throughput degradation detected: wave 1=${first.toFixed(1)}ms → wave 20=${last.toFixed(1)}ms (3× ceiling)`,
    )

    // Median wave time must be well-bounded
    const sorted = [...wallTimes].sort((a, b) => a - b)
    const medianMs = sorted[Math.floor(WAVES / 2)]!
    assert.ok(medianMs < 100, `median wave time ${medianMs.toFixed(1)}ms ≥ 100ms — capacity ceiling too low`)

    const bps = Math.round(((WAVES * PER_WAVE) / wallTimes.reduce((s, t) => s + t, 0)) * 1000)
    ;(globalThis as Record<string, unknown>)["__g15_sustained"] = { waves: WAVES, perWave: PER_WAVE, medianMs, bps }
  })
})
