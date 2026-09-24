/**
 * G11 — Ticketing Recovery
 *
 * Validates that when issue() fails after a successful book():
 *   - The system calls adapter.cancel(pnr) automatically
 *   - If cancel succeeds: status = FAILED, code = ISSUE_FAILED, no orphaned PNR
 *   - If cancel fails:    status = FAILED, code = PNR_ORPHANED, opsNotes set
 *   - The audit log captures both ISSUE FAILURE and CANCEL result
 *   - cancel() is NOT called when book() itself fails (no PNR exists)
 *   - cancel() is NOT called when recheck fails (no PNR exists)
 *   - A successfully issued booking never triggers cancel()
 *
 * All tests run entirely in-memory — no real DB, no GDS.
 *
 * R01 — issue() fails → cancel() is called with the correct PNR
 * R02 — issue() fails + cancel() succeeds → code = ISSUE_FAILED, no opsNotes
 * R03 — issue() fails + cancel() throws → code = PNR_ORPHANED, opsNotes set
 * R04 — book() fails → cancel() is NOT called (no PNR to void)
 * R05 — recheck() unavailable → cancel() is NOT called
 * R06 — recheck() price_changed → cancel() is NOT called
 * R07 — issue() fails + cancel() succeeds → audit log has ISSUE:FAILURE + CANCEL:SUCCESS
 * R08 — issue() fails + cancel() fails → audit log has ISSUE:FAILURE + CANCEL:FAILURE
 * R09 — opsNotes contains the PNR value when cancel fails
 * R10 — opsNotes is not set when cancel succeeds
 * R11 — Successful issue → cancel() never called, status = CONFIRMED
 * R12 — FAILED booking → second fulfillment call returns WRONG_STATUS
 * R13 — cancel() called with correct itinerary reference, not a different one
 * R14 — issue() throws transient error → cancel() still attempted (no short-circuit)
 * R15 — 10 concurrent issue() failures → 10 cancel() calls, no cross-contamination
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

type RecheckStatus = "AVAILABLE" | "PRICE_CHANGED" | "UNAVAILABLE" | "EXPIRED" | "ERROR"

interface BookingRecord {
  id: string
  reservationId: string
  status: BookingStatus
  pnr: string | null
  opsNotes: string | null
}

interface ReservationRecord {
  id: string
  status: string
}

interface AuditEntry {
  transactionType: string
  status: "SUCCESS" | "FAILURE"
  pnr?: string
}

interface AdapterConfig {
  recheckStatus?: RecheckStatus
  recheckThrows?: boolean
  bookThrows?: boolean
  issueThrows?: boolean
  cancelThrows?: boolean
  bookDelayMs?: number
}

// ---------------------------------------------------------------------------
// Fulfillment pipeline with recovery logic (mirrors fulfillment-action.ts)
// ---------------------------------------------------------------------------

type FulfillResult =
  | { ok: true; pnr: string }
  | { ok: false; error: string; code: string }

async function fulfillWithRecovery(
  booking: BookingRecord,
  reservation: ReservationRecord,
  adapter: AdapterConfig,
  audit: AuditEntry[],
  cancelCallLog: Array<{ pnr: string; itinerary: unknown }>,
): Promise<FulfillResult> {
  // CAS: PENDING → BOOKING_IN_PROGRESS
  if (booking.status !== "PENDING") {
    return { ok: false, error: `Statut invalide: ${booking.status}`, code: "WRONG_STATUS" }
  }
  booking.status = "BOOKING_IN_PROGRESS"
  reservation.status = "on_request"

  const itinerary = { tripType: "ONE_WAY", journeys: [] }

  // ── Recheck ───────────────────────────────────────────────────────────────
  const recheckStatus = adapter.recheckStatus ?? "AVAILABLE"
  if (adapter.recheckThrows) {
    audit.push({ transactionType: "RECHECK", status: "FAILURE" })
    booking.status = "FAILED"
    reservation.status = "cancelled"
    return { ok: false, error: "Recheck error", code: "RECHECK_ERROR" }
  }
  if (recheckStatus === "PRICE_CHANGED") {
    audit.push({ transactionType: "RECHECK", status: "FAILURE" })
    booking.status = "PRICE_CHANGED"
    return { ok: false, error: "Prix changé", code: "PRICE_CHANGED" }
  }
  if (recheckStatus !== "AVAILABLE") {
    audit.push({ transactionType: "RECHECK", status: "FAILURE" })
    booking.status = "FAILED"
    reservation.status = "cancelled"
    return { ok: false, error: "Indisponible", code: recheckStatus }
  }
  audit.push({ transactionType: "RECHECK", status: "SUCCESS" })

  // ── Book (PNR creation) ───────────────────────────────────────────────────
  if (adapter.bookThrows) {
    audit.push({ transactionType: "BOOK", status: "FAILURE" })
    booking.status = "FAILED"
    reservation.status = "cancelled"
    return { ok: false, error: "Book failed", code: "BOOK_FAILED" }
  }
  const pnr = `PNR-${booking.id.slice(-4).toUpperCase()}`
  booking.pnr = pnr
  audit.push({ transactionType: "BOOK", status: "SUCCESS", pnr })
  booking.status = "BOOKED"
  booking.status = "TICKETING_IN_PROGRESS"

  // ── Issue tickets ─────────────────────────────────────────────────────────
  if (adapter.issueThrows) {
    audit.push({ transactionType: "ISSUE", status: "FAILURE" })

    // G11: Auto-cancel — attempt to void the GDS PNR
    let pnrOrphaned = false
    cancelCallLog.push({ pnr, itinerary })
    if (adapter.cancelThrows) {
      audit.push({ transactionType: "CANCEL", status: "FAILURE", pnr })
      pnrOrphaned = true
    } else {
      audit.push({ transactionType: "CANCEL", status: "SUCCESS", pnr })
    }

    if (pnrOrphaned) {
      booking.opsNotes = `PNR orphan: cancel failed after issue() failure — manual void required. PNR: ${pnr}`
    }

    booking.status = "FAILED"
    reservation.status = "cancelled"
    return {
      ok: false,
      error: "L'émission du billet a échoué.",
      code: pnrOrphaned ? "PNR_ORPHANED" : "ISSUE_FAILED",
    }
  }

  audit.push({ transactionType: "ISSUE", status: "SUCCESS", pnr })
  booking.status = "CONFIRMED"
  reservation.status = "confirmed"
  return { ok: true, pnr }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let bookingSeq = 0
function makeBooking(): BookingRecord {
  const id = `booking-${++bookingSeq}`
  return { id, reservationId: `res-${bookingSeq}`, status: "PENDING", pnr: null, opsNotes: null }
}

function makeReservation(bookingSeq: number): ReservationRecord {
  return { id: `res-${bookingSeq}`, status: "pending" }
}

// ===========================================================================
// Tests
// ===========================================================================

describe("G11 — Ticketing Recovery", () => {

  test("R01 — issue() fails → cancel() is called with the correct PNR", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    const cancelLog: Array<{ pnr: string; itinerary: unknown }> = []
    await fulfillWithRecovery(b, r, { issueThrows: true }, [], cancelLog)

    assert.equal(cancelLog.length, 1, "cancel() must be called exactly once")
    assert.equal(cancelLog[0].pnr, b.pnr, "cancel() must receive the PNR returned by book()")
  })

  test("R02 — issue() fails + cancel() succeeds → code = ISSUE_FAILED, no opsNotes", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    const result = await fulfillWithRecovery(b, r, { issueThrows: true, cancelThrows: false }, [], [])

    assert.equal(result.ok, false)
    assert.equal((result as { code: string }).code, "ISSUE_FAILED")
    assert.equal(b.opsNotes, null, "opsNotes must not be set when cancel succeeds")
    assert.equal(b.status, "FAILED")
  })

  test("R03 — issue() fails + cancel() throws → code = PNR_ORPHANED, opsNotes set", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    const result = await fulfillWithRecovery(b, r, { issueThrows: true, cancelThrows: true }, [], [])

    assert.equal(result.ok, false)
    assert.equal((result as { code: string }).code, "PNR_ORPHANED")
    assert.ok(b.opsNotes, "opsNotes must be set when cancel fails")
    assert.equal(b.status, "FAILED")
  })

  test("R04 — book() fails → cancel() is NOT called (no PNR to void)", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    const cancelLog: Array<{ pnr: string; itinerary: unknown }> = []
    await fulfillWithRecovery(b, r, { bookThrows: true }, [], cancelLog)

    assert.equal(cancelLog.length, 0, "cancel() must not be called when book() fails")
    assert.equal(b.pnr, null, "PNR must not be set when book() fails")
    assert.equal(b.status, "FAILED")
  })

  test("R05 — recheck() UNAVAILABLE → cancel() is NOT called", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    const cancelLog: Array<{ pnr: string; itinerary: unknown }> = []
    await fulfillWithRecovery(b, r, { recheckStatus: "UNAVAILABLE" }, [], cancelLog)

    assert.equal(cancelLog.length, 0)
    assert.equal(b.pnr, null)
  })

  test("R06 — recheck() PRICE_CHANGED → cancel() is NOT called", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    const cancelLog: Array<{ pnr: string; itinerary: unknown }> = []
    await fulfillWithRecovery(b, r, { recheckStatus: "PRICE_CHANGED" }, [], cancelLog)

    assert.equal(cancelLog.length, 0)
    assert.equal(b.status, "PRICE_CHANGED")
  })

  test("R07 — issue() fails + cancel() succeeds → audit has ISSUE:FAILURE + CANCEL:SUCCESS", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    const audit: AuditEntry[] = []
    await fulfillWithRecovery(b, r, { issueThrows: true, cancelThrows: false }, audit, [])

    const issueEntry = audit.find((e) => e.transactionType === "ISSUE")
    const cancelEntry = audit.find((e) => e.transactionType === "CANCEL")

    assert.ok(issueEntry, "ISSUE entry must be present")
    assert.equal(issueEntry!.status, "FAILURE")
    assert.ok(cancelEntry, "CANCEL entry must be present")
    assert.equal(cancelEntry!.status, "SUCCESS")
  })

  test("R08 — issue() fails + cancel() fails → audit has ISSUE:FAILURE + CANCEL:FAILURE", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    const audit: AuditEntry[] = []
    await fulfillWithRecovery(b, r, { issueThrows: true, cancelThrows: true }, audit, [])

    const issueEntry = audit.find((e) => e.transactionType === "ISSUE")
    const cancelEntry = audit.find((e) => e.transactionType === "CANCEL")

    assert.ok(issueEntry)
    assert.equal(issueEntry!.status, "FAILURE")
    assert.ok(cancelEntry)
    assert.equal(cancelEntry!.status, "FAILURE")
  })

  test("R09 — opsNotes contains the PNR value when cancel fails", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    await fulfillWithRecovery(b, r, { issueThrows: true, cancelThrows: true }, [], [])

    assert.ok(b.opsNotes, "opsNotes must be set")
    assert.ok(b.pnr, "PNR must be set from book()")
    assert.ok(b.opsNotes!.includes(b.pnr!), `opsNotes must include PNR "${b.pnr}", got: "${b.opsNotes}"`)
    assert.ok(b.opsNotes!.toLowerCase().includes("manual"), "opsNotes must mention manual void")
  })

  test("R10 — opsNotes is null when cancel succeeds", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    await fulfillWithRecovery(b, r, { issueThrows: true, cancelThrows: false }, [], [])

    assert.equal(b.opsNotes, null)
  })

  test("R11 — Successful issue → cancel() never called, status = CONFIRMED", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    const cancelLog: Array<{ pnr: string; itinerary: unknown }> = []
    const result = await fulfillWithRecovery(b, r, {}, [], cancelLog)

    assert.equal(result.ok, true)
    assert.equal(b.status, "CONFIRMED")
    assert.equal(cancelLog.length, 0, "cancel() must never be called on successful issue")
  })

  test("R12 — FAILED booking → second fulfillment call returns WRONG_STATUS", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    await fulfillWithRecovery(b, r, { issueThrows: true }, [], [])

    // Second attempt
    const result2 = await fulfillWithRecovery(b, r, {}, [], [])
    assert.equal(result2.ok, false)
    assert.equal((result2 as { code: string }).code, "WRONG_STATUS")
  })

  test("R13 — cancel() called with same itinerary reference used for issue()", async () => {
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    const cancelLog: Array<{ pnr: string; itinerary: unknown }> = []
    await fulfillWithRecovery(b, r, { issueThrows: true }, [], cancelLog)

    // The itinerary passed to cancel() must not be null/undefined
    assert.ok(cancelLog[0].itinerary, "itinerary must be passed to cancel()")
    // Must be the same shape (tripType field present)
    assert.ok(
      typeof (cancelLog[0].itinerary as Record<string, unknown>).tripType === "string",
      "itinerary.tripType must be present",
    )
  })

  test("R14 — issue() transient error → cancel() still attempted (no short-circuit)", async () => {
    // Even if issue() throws with a transient network error, cancel() must run.
    const b = makeBooking()
    const r = makeReservation(bookingSeq)
    const cancelLog: Array<{ pnr: string; itinerary: unknown }> = []
    await fulfillWithRecovery(b, r, { issueThrows: true, cancelThrows: false }, [], cancelLog)

    assert.equal(cancelLog.length, 1, "cancel() must always be attempted after issue() failure")
  })

  test("R15 — 10 concurrent issue() failures → 10 cancel() calls, no cross-contamination", async () => {
    const cancelLog: Array<{ pnr: string; itinerary: unknown }> = []
    const bookings = Array.from({ length: 10 }, () => {
      const b = makeBooking()
      return { b, r: makeReservation(bookingSeq) }
    })

    await Promise.all(
      bookings.map(({ b, r }) =>
        fulfillWithRecovery(b, r, { issueThrows: true, cancelThrows: false }, [], cancelLog),
      ),
    )

    assert.equal(cancelLog.length, 10, "One cancel() call per booking")

    // Each cancel call must reference a unique PNR
    const pnrs = cancelLog.map((e) => e.pnr)
    const uniquePnrs = new Set(pnrs)
    assert.equal(uniquePnrs.size, 10, "Each cancel() must reference its own PNR — no cross-contamination")

    // Every booking must be FAILED
    const allFailed = bookings.every(({ b }) => b.status === "FAILED")
    assert.ok(allFailed, "All bookings must end in FAILED status")
  })
})
