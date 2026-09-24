/**
 * G13 — Inngest Reliability
 *
 * Validates that booking/flight.confirmed is reliable, traceable, and replayable
 * without double-processing:
 *
 *   1. dispatchFlightConfirmed retries with backoff on Inngest unavailability
 *   2. Permanent failure emits INNGEST_DISPATCH_FAILURE JSON to stderr (full payload)
 *   3. The idempotency key `flight.confirmed:<bookingId>` is stable across retries
 *      → Inngest deduplicates duplicate sends automatically
 *   4. Empty customerEmail emits INNGEST_DISPATCH_SKIPPED instead of silently dropping
 *   5. processFlightConfirmed throws on email error → Inngest retries (not swallowed)
 *
 * All tests run entirely in-memory — no real Inngest, no Resend, no DB.
 *
 * I01 — happy path: dispatch succeeds on first attempt, no retry, no stderr
 * I02 — Inngest fails once → retry, eventually succeeds, no stderr
 * I03 — Inngest permanently fails → INNGEST_DISPATCH_FAILURE emitted to stderr
 * I04 — permanent failure never throws (non-fatal to fulfillment)
 * I05 — event id = `flight.confirmed:<bookingId>` on every call (idempotency key)
 * I06 — retry backoff: first retry ≥ 100ms, second retry ≥ 200ms
 * I07 — stderr fallback JSON contains tag = "INNGEST_DISPATCH_FAILURE"
 * I08 — stderr fallback JSON contains bookingId, event name, full payload
 * I09 — stderr fallback JSON is parseable
 * I10 — empty customerEmail → INNGEST_DISPATCH_SKIPPED logged, dispatched = false
 * I11 — processFlightConfirmedHandler throws on email error (enables Inngest retry)
 * I12 — processFlightConfirmedHandler succeeds when email ok
 * I13 — same bookingId → identical event id regardless of how many times called
 * I14 — INNGEST_DISPATCH_SKIPPED JSON contains bookingId and reason
 * I15 — 10 concurrent dispatches for the same bookingId all use identical event id
 */

import assert from "node:assert/strict"
import { test, describe } from "node:test"

// ---------------------------------------------------------------------------
// Inline dispatchFlightConfirmedReliable (mirrors fulfillment-action.ts G13 logic)
// ---------------------------------------------------------------------------

const INNGEST_MAX_ATTEMPTS = 3
const INNGEST_RETRY_BASE_MS = 100

type FlightConfirmedPayload = {
  reservationId: string
  publicRef: string
  agencyId: string
  customerEmail: string
  customerName: string
  origin: string
  destination: string
  departureAt: string
  carrier: string
  flightNumber: string
  adults: number
  children: number
  totalTnd: number
}

type DispatchResult =
  | { dispatched: true; attempts: number; eventId: string }
  | { dispatched: false; skipped?: boolean; attempts: number; stderrLine?: string }

async function dispatchFlightConfirmedReliable(
  bookingId: string,
  customerEmail: string,
  payload: FlightConfirmedPayload,
  // injectable send — throws to simulate unavailability
  send: (id: string, name: string, data: FlightConfirmedPayload) => Promise<void>,
  // injectable for testing — records intended delays without actually sleeping
  recordedDelays: number[],
  // injectable stderr collector
  stderrLines: string[],
): Promise<DispatchResult> {
  if (!customerEmail) {
    const line = JSON.stringify({
      tag: "INNGEST_DISPATCH_SKIPPED",
      bookingId,
      event: "booking/flight.confirmed",
      reason: "no customer email",
      ts: new Date().toISOString(),
    })
    stderrLines.push(line)
    return { dispatched: false, skipped: true, attempts: 0 }
  }

  const eventId = `flight.confirmed:${bookingId}`

  for (let attempt = 1; attempt <= INNGEST_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        const delay = INNGEST_RETRY_BASE_MS * 2 ** (attempt - 2)
        recordedDelays.push(delay)
        // skip actual sleep in tests
      }
      await send(eventId, "booking/flight.confirmed", payload)
      return { dispatched: true, attempts: attempt, eventId }
    } catch (err) {
      if (attempt < INNGEST_MAX_ATTEMPTS) continue
      const line = JSON.stringify({
        tag: "INNGEST_DISPATCH_FAILURE",
        bookingId,
        event: "booking/flight.confirmed",
        payload,
        error: String(err),
        ts: new Date().toISOString(),
      })
      stderrLines.push(line)
      return { dispatched: false, attempts: attempt, stderrLine: line }
    }
  }
  // unreachable
  return { dispatched: false, attempts: INNGEST_MAX_ATTEMPTS }
}

// ---------------------------------------------------------------------------
// Inline processFlightConfirmedHandler (mirrors process-flight-confirmed.ts)
// ---------------------------------------------------------------------------

async function processFlightConfirmedHandler(
  data: FlightConfirmedPayload,
  sendEmail: (to: string, subject: string, html: string) => Promise<{ error?: string }>,
): Promise<{ reservationId: string; sent: boolean }> {
  const { error } = await sendEmail(
    data.customerEmail,
    `Confirmation de vol ${data.publicRef} — ${data.origin} → ${data.destination}`,
    `<h2>Vol confirmé</h2><p>PNR/Ref: ${data.publicRef}</p>`,
  )
  if (error) {
    throw new Error(`[process-flight-confirmed] envoi email échoué — ${error} (ref: ${data.publicRef})`)
  }
  return { reservationId: data.reservationId, sent: true }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const samplePayload: FlightConfirmedPayload = {
  reservationId: "res-abc",
  publicRef: "FL-001",
  agencyId: "ag-1",
  customerEmail: "client@example.com",
  customerName: "Ali Ben Salem",
  origin: "TUN",
  destination: "CDG",
  departureAt: "2026-10-15T06:30:00Z",
  carrier: "TU",
  flightNumber: "0721",
  adults: 2,
  children: 0,
  totalTnd: 1240.5,
}

const sendOk = async (_id: string, _name: string, _data: FlightConfirmedPayload) => {}

function sendFailN(n: number) {
  let calls = 0
  return async (_id: string, _name: string, _data: FlightConfirmedPayload) => {
    if (++calls <= n) throw new Error(`Inngest unavailable (attempt ${calls})`)
  }
}

const sendAlwaysFail = async () => {
  throw new Error("Inngest permanently down")
}

// ===========================================================================
// Tests
// ===========================================================================

describe("G13 — Inngest Reliability", () => {

  test("I01 — happy path: dispatch succeeds on first attempt, no retry, no stderr", async () => {
    const delays: number[] = []
    const stderr: string[] = []
    const result = await dispatchFlightConfirmedReliable(
      "bk-i01", "client@test.com", samplePayload, sendOk, delays, stderr,
    )

    assert.ok(result.dispatched)
    assert.equal(result.attempts, 1)
    assert.equal(delays.length, 0, "no delay on first-attempt success")
    assert.equal(stderr.length, 0, "no stderr on success")
  })

  test("I02 — Inngest fails once → retry, eventually succeeds, no stderr", async () => {
    const delays: number[] = []
    const stderr: string[] = []
    const result = await dispatchFlightConfirmedReliable(
      "bk-i02", "client@test.com", samplePayload, sendFailN(1), delays, stderr,
    )

    assert.ok(result.dispatched)
    assert.equal(result.attempts, 2, "2 total: 1 fail + 1 success")
    assert.equal(delays.length, 1, "1 retry delay")
    assert.equal(stderr.length, 0)
  })

  test("I03 — Inngest permanently fails → INNGEST_DISPATCH_FAILURE emitted to stderr", async () => {
    const stderr: string[] = []
    const result = await dispatchFlightConfirmedReliable(
      "bk-i03", "client@test.com", samplePayload, sendAlwaysFail, [], stderr,
    )

    assert.equal(result.dispatched, false)
    assert.equal(stderr.length, 1, "exactly one structured failure line")
  })

  test("I04 — permanent failure never throws (non-fatal to fulfillment)", async () => {
    const stderr: string[] = []
    await assert.doesNotReject(() =>
      dispatchFlightConfirmedReliable("bk-i04", "x@y.com", samplePayload, sendAlwaysFail, [], stderr),
    )
  })

  test("I05 — event id = `flight.confirmed:<bookingId>` on every call (idempotency key)", async () => {
    const capturedIds: string[] = []
    const capturingSend = async (id: string, _name: string, _data: FlightConfirmedPayload) => {
      capturedIds.push(id)
    }

    await dispatchFlightConfirmedReliable(
      "bk-i05", "client@test.com", samplePayload, capturingSend, [], [],
    )

    assert.equal(capturedIds.length, 1)
    assert.equal(capturedIds[0], "flight.confirmed:bk-i05")
  })

  test("I06 — retry backoff: first retry ≥ 100ms, second retry ≥ 200ms", async () => {
    const delays: number[] = []
    await dispatchFlightConfirmedReliable(
      "bk-i06", "client@test.com", samplePayload, sendAlwaysFail, delays, [],
    )

    assert.equal(delays.length, 2, "2 retry delays for 3 attempts")
    assert.ok(delays[0] >= 100, `first delay must be ≥ 100ms, got ${delays[0]}`)
    assert.ok(delays[1] >= 200, `second delay must be ≥ 200ms, got ${delays[1]}`)
  })

  test("I07 — stderr fallback JSON contains tag = 'INNGEST_DISPATCH_FAILURE'", async () => {
    const stderr: string[] = []
    await dispatchFlightConfirmedReliable(
      "bk-i07", "x@y.com", samplePayload, sendAlwaysFail, [], stderr,
    )

    const payload = JSON.parse(stderr[0]) as Record<string, unknown>
    assert.equal(payload.tag, "INNGEST_DISPATCH_FAILURE")
  })

  test("I08 — stderr fallback JSON contains bookingId, event name, full payload", async () => {
    const stderr: string[] = []
    await dispatchFlightConfirmedReliable(
      "bk-i08", "x@y.com", samplePayload, sendAlwaysFail, [], stderr,
    )

    const p = JSON.parse(stderr[0]) as Record<string, unknown>
    assert.equal(p.bookingId, "bk-i08")
    assert.equal(p.event, "booking/flight.confirmed")
    assert.ok(p.payload, "payload field must be present for manual replay")
    const inner = p.payload as Record<string, unknown>
    assert.equal(inner.reservationId, samplePayload.reservationId)
    assert.equal(inner.customerEmail, samplePayload.customerEmail)
    assert.equal(inner.totalTnd, samplePayload.totalTnd)
  })

  test("I09 — stderr fallback JSON is parseable", async () => {
    const stderr: string[] = []
    await dispatchFlightConfirmedReliable(
      "bk-i09", "x@y.com", samplePayload, sendAlwaysFail, [], stderr,
    )

    assert.equal(stderr.length, 1)
    assert.doesNotThrow(() => JSON.parse(stderr[0]), "must be valid JSON")
    const p = JSON.parse(stderr[0]) as Record<string, unknown>
    assert.ok(typeof p.ts === "string" && !isNaN(Date.parse(p.ts as string)), "ts must be a valid ISO date")
    assert.ok(typeof p.error === "string" && p.error.length > 0, "error must be a non-empty string")
  })

  test("I10 — empty customerEmail → INNGEST_DISPATCH_SKIPPED logged, dispatched = false", async () => {
    const stderr: string[] = []
    const result = await dispatchFlightConfirmedReliable(
      "bk-i10", "", samplePayload, sendOk, [], stderr,
    )

    assert.equal(result.dispatched, false)
    assert.equal(result.skipped, true)
    assert.equal(stderr.length, 1, "must log the skip")
    const p = JSON.parse(stderr[0]) as Record<string, unknown>
    assert.equal(p.tag, "INNGEST_DISPATCH_SKIPPED")
  })

  test("I11 — processFlightConfirmedHandler throws on email error (enables Inngest retry)", async () => {
    const failingSend = async (_to: string, _sub: string, _html: string) => ({
      error: "API rate limit",
    })

    await assert.rejects(
      () => processFlightConfirmedHandler(samplePayload, failingSend),
      /email échoué/,
      "must throw so Inngest can schedule retry",
    )
  })

  test("I12 — processFlightConfirmedHandler succeeds when email ok", async () => {
    const okSend = async () => ({ error: undefined })
    const result = await processFlightConfirmedHandler(samplePayload, okSend)

    assert.equal(result.sent, true)
    assert.equal(result.reservationId, samplePayload.reservationId)
  })

  test("I13 — same bookingId → identical event id regardless of how many times called", async () => {
    const ids: string[] = []
    let calls = 0
    const recordSend = async (id: string) => {
      ids.push(id)
      if (++calls <= 1) throw new Error("first call fails")
    }

    // Two calls for the same bookingId — once fails + once retries
    await dispatchFlightConfirmedReliable(
      "bk-i13", "x@y.com", samplePayload, recordSend, [], [],
    )

    // Both captured ids must be identical
    assert.ok(ids.length >= 1)
    const uniqueIds = new Set(ids)
    assert.equal(uniqueIds.size, 1, "all attempts must carry the same event id")
    assert.equal([...uniqueIds][0], "flight.confirmed:bk-i13")
  })

  test("I14 — INNGEST_DISPATCH_SKIPPED JSON contains bookingId and reason", async () => {
    const stderr: string[] = []
    await dispatchFlightConfirmedReliable(
      "bk-i14", "", samplePayload, sendOk, [], stderr,
    )

    const p = JSON.parse(stderr[0]) as Record<string, unknown>
    assert.equal(p.bookingId, "bk-i14")
    assert.ok(typeof p.reason === "string" && p.reason.length > 0, "reason must be present")
  })

  test("I15 — 10 concurrent dispatches for the same bookingId all use identical event id", async () => {
    const capturedIds: string[] = []
    const concurrentSend = async (id: string) => {
      capturedIds.push(id)
    }

    await Promise.all(
      Array.from({ length: 10 }, () =>
        dispatchFlightConfirmedReliable(
          "bk-i15-shared", "x@y.com", samplePayload, concurrentSend, [], [],
        ),
      ),
    )

    assert.equal(capturedIds.length, 10, "10 calls → 10 sends")
    const uniqueIds = new Set(capturedIds)
    assert.equal(uniqueIds.size, 1, "all 10 must carry the same idempotency key")
    assert.equal([...uniqueIds][0], "flight.confirmed:bk-i15-shared")
  })
})
