/**
 * G11b — Secure Retry: PNR_ORPHANED path guarantees book() is never called twice
 *
 * Scenario: BOOK succeeds → ISSUE fails → CANCEL fails → PNR_ORPHANED.
 * A second call to fulfillFlightBooking must NOT call book() again.
 * It must enter the Arm B re-issue path: load the existing PNR, call
 * issue() only, and if that succeeds → CONFIRMED + opsNotes cleared.
 *
 * All tests run entirely in-memory — no real DB, no GDS.
 *
 * Q01 — PNR_ORPHANED booking is eligible for re-issue (Arm B CAS succeeds)
 * Q02 — FAILED booking WITHOUT pnr is NOT eligible for re-issue (WRONG_STATUS)
 * Q03 — Re-issue path never calls book()
 * Q04 — Re-issue path never calls recheck()
 * Q05 — Re-issue path calls issue() with the existing PNR
 * Q06 — Re-issue succeeds → status = CONFIRMED, opsNotes cleared
 * Q07 — Re-issue succeeds → returns same PNR (not a new one)
 * Q08 — Re-issue issue() fails again → cancel() called, PNR_ORPHANED again
 * Q09 — Re-issue issue() fails + cancel() succeeds → code = ISSUE_FAILED (not PNR_ORPHANED)
 * Q10 — Two concurrent re-issue calls on same booking → exactly 1 wins (Arm B CAS)
 * Q11 — Normal PENDING booking: Arm A still works (no regression)
 * Q12 — CONFIRMED booking is not eligible for re-issue (WRONG_STATUS)
 * Q13 — Arm B CAS: FAILED + null pnr → 0 rows (never claimed)
 * Q14 — Re-issue audit log contains ISSUE:SUCCESS — no BOOK entry
 * Q15 — Full lifecycle: PENDING → … → PNR_ORPHANED → re-issue → CONFIRMED
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
  | "CANCELLED"

interface BookingRecord {
  id: string
  reservationId: string
  status: BookingStatus
  pnr: string | null
  supplierBookingRef: string | null
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
  recheckThrows?: boolean
  bookThrows?: boolean
  issueThrows?: boolean
  cancelThrows?: boolean
  recheckCallCount?: { n: number }
  bookCallCount?: { n: number }
  issueCallCount?: { n: number }
  cancelCallCount?: { n: number }
}

type FulfillResult =
  | { ok: true; pnr: string }
  | { ok: false; error: string; code: string }

// ---------------------------------------------------------------------------
// Two-arm CAS + fulfillment pipeline (mirrors fulfillment-action.ts logic)
// ---------------------------------------------------------------------------

async function fulfillWithTwoArmCAS(
  db: { bookings: BookingRecord[]; reservations: ReservationRecord[] },
  reservationId: string,
  adapter: AdapterConfig,
  audit: AuditEntry[],
): Promise<FulfillResult> {
  const booking = db.bookings.find((b) => b.reservationId === reservationId)
  const reservation = db.reservations.find((r) => r.id === reservationId)
  if (!booking || !reservation) {
    return { ok: false, error: "Réservation introuvable.", code: "NOT_FOUND" }
  }

  // ── Arm A: PENDING → BOOKING_IN_PROGRESS ──────────────────────────────────
  let reissueOnly = false

  if (booking.status === "PENDING") {
    booking.status = "BOOKING_IN_PROGRESS"
    reservation.status = "on_request"
  } else if (booking.status === "FAILED" && booking.pnr !== null) {
    // ── Arm B: FAILED + pnr IS NOT NULL → TICKETING_IN_PROGRESS ──────────────
    booking.status = "TICKETING_IN_PROGRESS"
    reissueOnly = true
  } else {
    const hint = booking.status === "FAILED" && !booking.pnr
      ? " (aucun PNR — le dossier doit être réinitialisé manuellement)"
      : ""
    return {
      ok: false,
      error: `Ce dossier est déjà en statut ${booking.status}.${hint}`,
      code: "WRONG_STATUS",
    }
  }

  const itinerary = { tripType: "ONE_WAY", journeys: [] }
  let activePnr: string

  if (reissueOnly) {
    // Re-issue: skip recheck + book — use existing PNR
    activePnr = booking.pnr! // guaranteed non-null by Arm B condition
  } else {
    // Normal path: recheck → book

    // ── Recheck ───────────────────────────────────────────────────────────────
    if (adapter.recheckCallCount) adapter.recheckCallCount.n++
    if (adapter.recheckThrows) {
      audit.push({ transactionType: "RECHECK", status: "FAILURE" })
      booking.status = "FAILED"
      return { ok: false, error: "Recheck error", code: "RECHECK_ERROR" }
    }
    audit.push({ transactionType: "RECHECK", status: "SUCCESS" })

    // ── Book ──────────────────────────────────────────────────────────────────
    if (adapter.bookCallCount) adapter.bookCallCount.n++
    if (adapter.bookThrows) {
      audit.push({ transactionType: "BOOK", status: "FAILURE" })
      booking.status = "FAILED"
      return { ok: false, error: "Book failed", code: "BOOK_FAILED" }
    }
    const newPnr = `PNR-${booking.id.slice(-4).toUpperCase()}-${Date.now()}`
    booking.pnr = newPnr
    booking.status = "BOOKED"
    booking.status = "TICKETING_IN_PROGRESS"
    audit.push({ transactionType: "BOOK", status: "SUCCESS", pnr: newPnr })
    activePnr = newPnr
  }

  // ── Issue ─────────────────────────────────────────────────────────────────
  if (adapter.issueCallCount) adapter.issueCallCount.n++
  if (adapter.issueThrows) {
    audit.push({ transactionType: "ISSUE", status: "FAILURE" })

    // Auto-cancel
    if (adapter.cancelCallCount) adapter.cancelCallCount.n++
    let pnrOrphaned = false
    if (adapter.cancelThrows) {
      audit.push({ transactionType: "CANCEL", status: "FAILURE", pnr: activePnr })
      pnrOrphaned = true
    } else {
      audit.push({ transactionType: "CANCEL", status: "SUCCESS", pnr: activePnr })
    }

    if (pnrOrphaned) {
      booking.opsNotes = `PNR orphan: cancel failed after issue() failure — manual void required. PNR: ${activePnr}`
    }

    booking.status = "FAILED"
    reservation.status = "cancelled"
    return {
      ok: false,
      error: "L'émission du billet a échoué.",
      code: pnrOrphaned ? "PNR_ORPHANED" : "ISSUE_FAILED",
    }
  }

  audit.push({ transactionType: "ISSUE", status: "SUCCESS", pnr: activePnr })
  booking.status = "CONFIRMED"
  reservation.status = "confirmed"

  // Clear orphan flag on successful re-issue
  if (reissueOnly) booking.opsNotes = null

  return { ok: true, pnr: activePnr }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let bookingSeq = 0

function makeDB(initialStatus: BookingStatus = "PENDING", pnr: string | null = null, opsNotes: string | null = null) {
  const id = `booking-${++bookingSeq}`
  const reservationId = `res-${bookingSeq}`
  const booking: BookingRecord = { id, reservationId, status: initialStatus, pnr, supplierBookingRef: null, opsNotes }
  const reservation: ReservationRecord = { id: reservationId, status: "pending" }
  return { bookings: [booking], reservations: [reservation], reservationId, booking }
}

// ===========================================================================
// Tests
// ===========================================================================

describe("G11b — Secure Retry: PNR_ORPHANED", () => {

  test("Q01 — PNR_ORPHANED booking (FAILED + pnr set) is eligible for Arm B re-issue", async () => {
    const { bookings, reservations, reservationId, booking } = makeDB("FAILED", "PNR-ABCD", "PNR orphan: ...")
    const result = await fulfillWithTwoArmCAS({ bookings, reservations }, reservationId, {}, [])
    assert.equal(result.ok, true)
    assert.equal(booking.status, "CONFIRMED")
  })

  test("Q02 — FAILED booking WITHOUT pnr is NOT eligible for re-issue (WRONG_STATUS)", async () => {
    const { bookings, reservations, reservationId } = makeDB("FAILED", null)
    const result = await fulfillWithTwoArmCAS({ bookings, reservations }, reservationId, {}, [])
    assert.equal(result.ok, false)
    assert.equal((result as { code: string }).code, "WRONG_STATUS")
    assert.ok(
      (result as { error: string }).error.includes("réinitialisé"),
      "Error hint must mention manual reset",
    )
  })

  test("Q03 — Re-issue path never calls book()", async () => {
    const { bookings, reservations, reservationId } = makeDB("FAILED", "PNR-ABCD")
    const bookCount = { n: 0 }
    await fulfillWithTwoArmCAS({ bookings, reservations }, reservationId, { bookCallCount: bookCount }, [])
    assert.equal(bookCount.n, 0, "book() must never be called in the re-issue path")
  })

  test("Q04 — Re-issue path never calls recheck()", async () => {
    const { bookings, reservations, reservationId } = makeDB("FAILED", "PNR-ABCD")
    const recheckCount = { n: 0 }
    await fulfillWithTwoArmCAS({ bookings, reservations }, reservationId, { recheckCallCount: recheckCount }, [])
    assert.equal(recheckCount.n, 0, "recheck() must never be called in the re-issue path")
  })

  test("Q05 — Re-issue path calls issue() with the existing PNR", async () => {
    const existingPnr = "PNR-EXISTING"
    const { bookings, reservations, reservationId } = makeDB("FAILED", existingPnr)
    const audit: AuditEntry[] = []
    await fulfillWithTwoArmCAS({ bookings, reservations }, reservationId, {}, audit)

    const issueEntry = audit.find((e) => e.transactionType === "ISSUE")
    assert.ok(issueEntry, "ISSUE entry must exist in audit")
    assert.equal(issueEntry!.pnr, existingPnr, `issue() must use existing PNR "${existingPnr}"`)
  })

  test("Q06 — Re-issue succeeds → status = CONFIRMED, opsNotes cleared", async () => {
    const { bookings, reservations, reservationId, booking } = makeDB("FAILED", "PNR-ABCD", "PNR orphan: ...")
    await fulfillWithTwoArmCAS({ bookings, reservations }, reservationId, {}, [])

    assert.equal(booking.status, "CONFIRMED")
    assert.equal(booking.opsNotes, null, "opsNotes must be cleared on successful re-issue")
  })

  test("Q07 — Re-issue succeeds → returns the existing PNR (not a new one)", async () => {
    const existingPnr = "PNR-EXISTING"
    const { bookings, reservations, reservationId } = makeDB("FAILED", existingPnr)
    const result = await fulfillWithTwoArmCAS({ bookings, reservations }, reservationId, {}, [])

    assert.equal(result.ok, true)
    assert.equal((result as { pnr: string }).pnr, existingPnr, "Returned PNR must be the existing one")
  })

  test("Q08 — Re-issue issue() fails + cancel() fails → code = PNR_ORPHANED again", async () => {
    const { bookings, reservations, reservationId, booking } = makeDB("FAILED", "PNR-ABCD", "PNR orphan: ...")
    const result = await fulfillWithTwoArmCAS(
      { bookings, reservations },
      reservationId,
      { issueThrows: true, cancelThrows: true },
      [],
    )
    assert.equal(result.ok, false)
    assert.equal((result as { code: string }).code, "PNR_ORPHANED")
    assert.equal(booking.status, "FAILED")
    assert.ok(booking.opsNotes, "opsNotes must be set on repeated PNR_ORPHANED")
  })

  test("Q09 — Re-issue issue() fails + cancel() succeeds → code = ISSUE_FAILED", async () => {
    const { bookings, reservations, reservationId } = makeDB("FAILED", "PNR-ABCD")
    const result = await fulfillWithTwoArmCAS(
      { bookings, reservations },
      reservationId,
      { issueThrows: true, cancelThrows: false },
      [],
    )
    assert.equal(result.ok, false)
    assert.equal((result as { code: string }).code, "ISSUE_FAILED")
  })

  test("Q10 — Two concurrent re-issue calls on same booking → exactly 1 wins (Arm B CAS)", async () => {
    const { bookings, reservations, reservationId } = makeDB("FAILED", "PNR-ABCD")

    const results = await Promise.all([
      fulfillWithTwoArmCAS({ bookings, reservations }, reservationId, {}, []),
      fulfillWithTwoArmCAS({ bookings, reservations }, reservationId, {}, []),
    ])

    const wins = results.filter((r) => r.ok)
    const rejections = results.filter((r) => !r.ok && (r as { code: string }).code === "WRONG_STATUS")
    assert.equal(wins.length, 1, "Exactly 1 re-issue must succeed")
    assert.equal(rejections.length, 1, "The second concurrent call must get WRONG_STATUS")
  })

  test("Q11 — Normal PENDING booking: Arm A still works (no regression)", async () => {
    const { bookings, reservations, reservationId, booking } = makeDB("PENDING")
    const bookCount = { n: 0 }
    const result = await fulfillWithTwoArmCAS(
      { bookings, reservations },
      reservationId,
      { bookCallCount: bookCount },
      [],
    )
    assert.equal(result.ok, true)
    assert.equal(booking.status, "CONFIRMED")
    assert.equal(bookCount.n, 1, "Normal path must call book() exactly once")
  })

  test("Q12 — CONFIRMED booking is not eligible for re-issue (WRONG_STATUS)", async () => {
    const { bookings, reservations, reservationId } = makeDB("CONFIRMED", "PNR-DONE")
    const result = await fulfillWithTwoArmCAS({ bookings, reservations }, reservationId, {}, [])
    assert.equal(result.ok, false)
    assert.equal((result as { code: string }).code, "WRONG_STATUS")
  })

  test("Q13 — Arm B CAS: FAILED + null pnr → 0 rows, returns WRONG_STATUS", async () => {
    const { bookings, reservations, reservationId } = makeDB("FAILED", null)
    const result = await fulfillWithTwoArmCAS({ bookings, reservations }, reservationId, {}, [])
    assert.equal(result.ok, false)
    assert.equal((result as { code: string }).code, "WRONG_STATUS")
  })

  test("Q14 — Re-issue audit log: ISSUE:SUCCESS present, no BOOK entry", async () => {
    const { bookings, reservations, reservationId } = makeDB("FAILED", "PNR-ABCD")
    const audit: AuditEntry[] = []
    await fulfillWithTwoArmCAS({ bookings, reservations }, reservationId, {}, audit)

    const bookEntry = audit.find((e) => e.transactionType === "BOOK")
    const issueEntry = audit.find((e) => e.transactionType === "ISSUE")

    assert.equal(bookEntry, undefined, "BOOK must not appear in re-issue audit log")
    assert.ok(issueEntry, "ISSUE must appear in re-issue audit log")
    assert.equal(issueEntry!.status, "SUCCESS")
  })

  test("Q15 — Full lifecycle: PENDING → PNR_ORPHANED → re-issue → CONFIRMED", async () => {
    const { bookings, reservations, reservationId, booking } = makeDB("PENDING")
    const issueCallCount = { n: 0 }
    const bookCallCount = { n: 0 }

    // First call: book succeeds, issue fails, cancel fails → PNR_ORPHANED
    const result1 = await fulfillWithTwoArmCAS(
      { bookings, reservations },
      reservationId,
      { issueThrows: true, cancelThrows: true, issueCallCount, bookCallCount },
      [],
    )
    assert.equal(result1.ok, false)
    assert.equal((result1 as { code: string }).code, "PNR_ORPHANED")
    assert.equal(booking.status, "FAILED")
    assert.ok(booking.pnr, "PNR must be stored after successful book()")
    assert.ok(booking.opsNotes, "opsNotes must be set")
    const orphanedPnr = booking.pnr!

    // Second call (re-issue): must NOT call book() again, must use orphanedPnr
    const result2 = await fulfillWithTwoArmCAS(
      { bookings, reservations },
      reservationId,
      { issueCallCount, bookCallCount }, // no throws → issue succeeds
      [],
    )
    assert.equal(result2.ok, true)
    assert.equal((result2 as { pnr: string }).pnr, orphanedPnr, "Re-issue must use the same PNR")
    assert.equal(booking.status, "CONFIRMED")
    assert.equal(booking.opsNotes, null, "opsNotes must be cleared")
    assert.equal(bookCallCount.n, 1, "book() called exactly once across both calls")
    assert.equal(issueCallCount.n, 2, "issue() called once per attempt")
  })
})
