/**
 * G12 — Supplier Transaction Reliability
 *
 * Validates that logTransaction never silently discards audit entries:
 *   - Transient DB errors are retried with exponential backoff
 *   - On final failure a structured JSON line is emitted to stderr (tag: AUDIT_FAILURE)
 *   - The booking flow is never aborted (non-fatal)
 *   - All required fields are present in both the DB row and the fallback payload
 *
 * All tests run entirely in-memory — no real DB, no GDS.
 *
 * S01 — happy path: DB succeeds on first attempt, no retry, no stderr
 * S02 — DB fails once then succeeds → retried exactly twice total (1 fail + 1 success)
 * S03 — DB fails all attempts → structured JSON emitted to stderr
 * S04 — failure never throws (non-fatal)
 * S05 — success on last retry (4th attempt) → no stderr
 * S06 — retry backoff: each wait is ≥ previous (non-decreasing)
 * S07 — stderr fallback JSON is parseable
 * S08 — stderr JSON contains bookingId, provider, transactionType, status
 * S09 — stderr JSON contains tag = "AUDIT_FAILURE"
 * S10 — stderr JSON contains durationMs and error string
 * S11 — stderr JSON contains ts (ISO timestamp)
 * S12 — attempt count: exactly AUDIT_MAX_ATTEMPTS on complete failure
 * S13 — success after exactly 2 failures → no stderr, total 3 attempts
 * S14 — 20 concurrent logTransaction calls, each DB-failing → 20 stderr lines (no cross-contamination)
 * S15 — ISSUE + CANCEL both logged reliably even when DB fails on first attempt for each
 */

import assert from "node:assert/strict"
import { test, describe } from "node:test"

// ---------------------------------------------------------------------------
// Inline logTransaction with injectable db + sleep (mirrors fulfillment-action.ts)
// ---------------------------------------------------------------------------

const AUDIT_MAX_ATTEMPTS = 4
const AUDIT_RETRY_BASE_MS = 50

type LogEntry = {
  bookingId: string | null
  provider: string
  transactionType: string
  status: "SUCCESS" | "FAILURE"
  durationMs: number
}

type LogResult =
  | { outcome: "stored"; attempts: number }
  | { outcome: "fallback"; attempts: number; stderrLine: string }

async function logTransactionReliable(
  bookingId: string | null,
  provider: string,
  transactionType: string,
  status: "SUCCESS" | "FAILURE",
  durationMs: number,
  // injectable db insert — throws to simulate failure
  dbInsert: (entry: LogEntry) => Promise<void>,
  // injectable sleep — records delays for assertion
  recordedDelays: number[],
  // injectable stderr collector instead of console.error
  stderrLines: string[],
): Promise<LogResult> {
  const entry: LogEntry = { bookingId, provider, transactionType, status, durationMs }

  for (let attempt = 1; attempt <= AUDIT_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        const delay = AUDIT_RETRY_BASE_MS * 2 ** (attempt - 2)
        recordedDelays.push(delay)
        // real sleep omitted in tests — just record the intended delay
      }
      await dbInsert(entry)
      return { outcome: "stored", attempts: attempt }
    } catch (err) {
      if (attempt < AUDIT_MAX_ATTEMPTS) continue
      const line = JSON.stringify({
        tag: "AUDIT_FAILURE",
        bookingId,
        provider,
        transactionType,
        status,
        durationMs,
        error: String(err),
        ts: new Date().toISOString(),
      })
      stderrLines.push(line)
      return { outcome: "fallback", attempts: attempt, stderrLine: line }
    }
  }
  // unreachable
  throw new Error("logTransactionReliable: control escaped loop")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** DB that always succeeds */
const dbOk = async (_: LogEntry) => {}

/** DB that fails N times then succeeds */
function dbFailN(n: number): (e: LogEntry) => Promise<void> {
  let calls = 0
  return async (_: LogEntry) => {
    if (++calls <= n) throw new Error(`DB transient error (attempt ${calls})`)
  }
}

/** DB that always throws */
const dbAlwaysFail = async (_: LogEntry) => {
  throw new Error("DB permanently down")
}

// ===========================================================================
// Tests
// ===========================================================================

describe("G12 — Supplier Transaction Reliability", () => {

  test("S01 — happy path: DB succeeds on first attempt, no retry, no stderr", async () => {
    const delays: number[] = []
    const stderr: string[] = []
    const result = await logTransactionReliable(
      "bk-001", "AMADEUS", "BOOK", "SUCCESS", 420, dbOk, delays, stderr,
    )

    assert.equal(result.outcome, "stored")
    assert.equal(result.attempts, 1, "must succeed in 1 attempt")
    assert.equal(delays.length, 0, "no retry delay on first-attempt success")
    assert.equal(stderr.length, 0, "no stderr on success")
  })

  test("S02 — DB fails once then succeeds → retried exactly twice total (1 fail + 1 success)", async () => {
    const delays: number[] = []
    const stderr: string[] = []
    const result = await logTransactionReliable(
      "bk-002", "AMADEUS", "RECHECK", "FAILURE", 120, dbFailN(1), delays, stderr,
    )

    assert.equal(result.outcome, "stored")
    assert.equal(result.attempts, 2, "2 total attempts: 1 fail + 1 success")
    assert.equal(delays.length, 1, "1 retry delay recorded")
    assert.equal(stderr.length, 0, "no stderr when retry eventually succeeds")
  })

  test("S03 — DB fails all attempts → structured JSON emitted to stderr", async () => {
    const delays: number[] = []
    const stderr: string[] = []
    const result = await logTransactionReliable(
      "bk-003", "SABRE", "ISSUE", "FAILURE", 800, dbAlwaysFail, delays, stderr,
    )

    assert.equal(result.outcome, "fallback")
    assert.equal(stderr.length, 1, "exactly one structured line on stderr")
  })

  test("S04 — failure never throws (non-fatal)", async () => {
    const delays: number[] = []
    const stderr: string[] = []
    // Must NOT throw even when db always fails
    await assert.doesNotReject(
      () => logTransactionReliable("bk-004", "AMADEUS", "CANCEL", "FAILURE", 50, dbAlwaysFail, delays, stderr),
    )
  })

  test("S05 — success on last retry (4th attempt) → no stderr", async () => {
    const delays: number[] = []
    const stderr: string[] = []
    // fail 3 times, succeed on attempt 4 (= AUDIT_MAX_ATTEMPTS)
    const result = await logTransactionReliable(
      "bk-005", "TRAVELPORT", "BOOK", "SUCCESS", 310, dbFailN(3), delays, stderr,
    )

    assert.equal(result.outcome, "stored")
    assert.equal(result.attempts, 4, "success on 4th attempt")
    assert.equal(stderr.length, 0, "no stderr when last retry succeeds")
    assert.equal(delays.length, 3, "3 delays recorded for 3 retries")
  })

  test("S06 — retry backoff: each wait is ≥ previous (non-decreasing)", async () => {
    const delays: number[] = []
    const stderr: string[] = []
    await logTransactionReliable(
      "bk-006", "AMADEUS", "RECHECK", "SUCCESS", 90, dbFailN(3), delays, stderr,
    )

    assert.equal(delays.length, 3)
    // delays should be 50, 100, 200
    assert.equal(delays[0], 50)
    assert.equal(delays[1], 100)
    assert.equal(delays[2], 200)
    // monotonically non-decreasing
    for (let i = 1; i < delays.length; i++) {
      assert.ok(delays[i] >= delays[i - 1], `delay[${i}]=${delays[i]} must be >= delay[${i - 1}]=${delays[i - 1]}`)
    }
  })

  test("S07 — stderr fallback JSON is parseable", async () => {
    const stderr: string[] = []
    await logTransactionReliable("bk-007", "AMADEUS", "ISSUE", "FAILURE", 500, dbAlwaysFail, [], stderr)

    assert.equal(stderr.length, 1)
    let parsed: unknown
    assert.doesNotThrow(() => { parsed = JSON.parse(stderr[0]) }, "stderr must be valid JSON")
    assert.ok(parsed && typeof parsed === "object", "parsed must be an object")
  })

  test("S08 — stderr JSON contains bookingId, provider, transactionType, status", async () => {
    const stderr: string[] = []
    await logTransactionReliable("bk-008", "SABRE", "BOOK", "FAILURE", 300, dbAlwaysFail, [], stderr)

    const payload = JSON.parse(stderr[0]) as Record<string, unknown>
    assert.equal(payload.bookingId, "bk-008")
    assert.equal(payload.provider, "SABRE")
    assert.equal(payload.transactionType, "BOOK")
    assert.equal(payload.status, "FAILURE")
  })

  test("S09 — stderr JSON contains tag = 'AUDIT_FAILURE'", async () => {
    const stderr: string[] = []
    await logTransactionReliable("bk-009", "AMADEUS", "CANCEL", "FAILURE", 100, dbAlwaysFail, [], stderr)

    const payload = JSON.parse(stderr[0]) as Record<string, unknown>
    assert.equal(payload.tag, "AUDIT_FAILURE")
  })

  test("S10 — stderr JSON contains durationMs and error string", async () => {
    const stderr: string[] = []
    await logTransactionReliable("bk-010", "AMADEUS", "RECHECK", "SUCCESS", 999, dbAlwaysFail, [], stderr)

    const payload = JSON.parse(stderr[0]) as Record<string, unknown>
    assert.equal(payload.durationMs, 999)
    assert.ok(typeof payload.error === "string", "error field must be a string")
    assert.ok((payload.error as string).length > 0, "error must not be empty")
  })

  test("S11 — stderr JSON contains ts (ISO timestamp)", async () => {
    const stderr: string[] = []
    await logTransactionReliable("bk-011", "AMADEUS", "ISSUE", "FAILURE", 600, dbAlwaysFail, [], stderr)

    const payload = JSON.parse(stderr[0]) as Record<string, unknown>
    assert.ok(typeof payload.ts === "string", "ts must be a string")
    assert.ok(!isNaN(Date.parse(payload.ts as string)), "ts must be a valid ISO date")
  })

  test("S12 — attempt count: exactly AUDIT_MAX_ATTEMPTS on complete failure", async () => {
    const stderr: string[] = []
    const result = await logTransactionReliable(
      "bk-012", "TRAVELPORT", "BOOK", "FAILURE", 700, dbAlwaysFail, [], stderr,
    )

    assert.equal(result.outcome, "fallback")
    assert.equal(result.attempts, AUDIT_MAX_ATTEMPTS, `must try exactly ${AUDIT_MAX_ATTEMPTS} times before giving up`)
  })

  test("S13 — success after exactly 2 failures → no stderr, total 3 attempts", async () => {
    const delays: number[] = []
    const stderr: string[] = []
    const result = await logTransactionReliable(
      "bk-013", "AMADEUS", "ISSUE", "SUCCESS", 450, dbFailN(2), delays, stderr,
    )

    assert.equal(result.outcome, "stored")
    assert.equal(result.attempts, 3)
    assert.equal(delays.length, 2, "2 delays for 2 retries")
    assert.equal(stderr.length, 0, "no stderr on eventual success")
  })

  test("S14 — 20 concurrent logTransaction calls, each DB-failing → 20 stderr lines, no cross-contamination", async () => {
    const allStderr: string[] = []

    const ids = Array.from({ length: 20 }, (_, i) => `bk-conc-${i + 1}`)

    await Promise.all(
      ids.map((id) =>
        logTransactionReliable(
          id, "AMADEUS", "BOOK", "FAILURE", 100, dbAlwaysFail, [], allStderr,
        ),
      ),
    )

    assert.equal(allStderr.length, 20, "each concurrent call must emit exactly one stderr line")

    const payloads = allStderr.map((line) => JSON.parse(line) as Record<string, unknown>)
    const bookingIds = payloads.map((p) => p.bookingId)
    const uniqueIds = new Set(bookingIds)
    assert.equal(uniqueIds.size, 20, "each stderr line must reference its own booking ID")

    // Every id from the input must appear
    for (const id of ids) {
      assert.ok(uniqueIds.has(id), `missing stderr line for booking ${id}`)
    }
  })

  test("S15 — ISSUE + CANCEL both logged reliably even when DB fails on first attempt for each", async () => {
    const stderr: string[] = []
    const capturedTypes: string[] = []

    // DB fails once per call then succeeds — captures transactionType to confirm both calls land
    let callIndex = 0
    const dbCapture = async (entry: LogEntry) => {
      callIndex++
      if (callIndex % 2 === 1) throw new Error("transient")
      capturedTypes.push(entry.transactionType)
    }

    await Promise.all([
      logTransactionReliable("bk-015", "AMADEUS", "ISSUE", "FAILURE", 500, dbCapture, [], stderr),
      logTransactionReliable("bk-015", "AMADEUS", "CANCEL", "SUCCESS", 120, dbCapture, [], stderr),
    ])

    assert.equal(stderr.length, 0, "no fallback when retry succeeds")
    assert.ok(capturedTypes.includes("ISSUE"), "ISSUE must be stored")
    assert.ok(capturedTypes.includes("CANCEL"), "CANCEL must be stored")
  })
})
