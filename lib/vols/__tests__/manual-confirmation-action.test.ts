/**
 * PROVIDER-CONNECTIVITY-BRIDGE (P3) — Manual B2B_OFFLINE confirmation tests
 *
 * Inline re-implementation of confirmManualFlightBooking()'s core logic
 * (auth/role guard already covered structurally — see M6/M7 below), without
 * real DB or Supabase auth, following the same pattern as
 * fulfillment-action.test.ts (G8).
 *
 * Mandatory cases (chantier section 14):
 *  M1: nonexistent reservation → NOT_FOUND
 *  M2: already-confirmed booking → WRONG_STATUS, no state change
 *  M3: wrong staff role → FORBIDDEN, no state change, no DB write attempted
 *  M4: missing supplier reference → INVALID_INPUT
 *  M5: invalid price (zero/negative) → INVALID_INPUT
 *  M6: double confirmation (same path called twice) → second call WRONG_STATUS
 *  M7: concurrent confirmation (manual vs manual) → only one CAS winner
 *  M8: API_DIRECT already confirmed the booking → manual path loses the CAS
 *      (mutual exclusion between the two channels for the same booking)
 *  M9: financials recorded exactly once (never twice) across the whole flow
 *  M10: happy path — PENDING → CONFIRMED, fulfillmentMode="b2b_offline",
 *       supplierBookingRef persisted, B2B_VALIDATION transaction logged,
 *       snapshot never mutated
 */

import assert from "node:assert/strict"
import { test, describe, beforeEach } from "node:test"

const FULFILL_ROLES = ["super_admin", "manager", "agent_resa"] as const

interface FakeBooking {
  id: string
  status: string
  reservationId: string
  priceSnapshotId: string | null
  provider: string
  fulfillmentMode: string | null
  supplierBookingRef: string | null
}

interface FakeSnapshot {
  id: string
  supplierAmount: string
  sellingAmount: string
  mutated: boolean
}

let fakeBooking: FakeBooking
let fakeSnapshot: FakeSnapshot
let reservationStatus: string
let statusTransitions: string[]
let transactionsLogged: Array<{ type: string; response: Record<string, unknown> }>
let financialsRecorded: Array<{ reservationId: string; supplierPriceTnd: number; salePriceTnd: number }>

function resetState() {
  fakeBooking = {
    id: "booking-uuid-001",
    status: "PENDING",
    reservationId: "reservation-uuid-001",
    priceSnapshotId: "snapshot-uuid-001",
    provider: "amadeus",
    fulfillmentMode: null,
    supplierBookingRef: null,
  }
  fakeSnapshot = {
    id: "snapshot-uuid-001",
    supplierAmount: "420.000",
    sellingAmount: "450.000",
    mutated: false,
  }
  reservationStatus = "pending"
  statusTransitions = []
  transactionsLogged = []
  financialsRecorded = []
}

interface ManualInput {
  supplierBookingRef: string
  confirmedPrice: number
  confirmedCurrency?: string
  operatorNote?: string
}

function validateInput(input: ManualInput): { ok: true } | { ok: false; error: string; code: string } {
  if (!input.supplierBookingRef || !input.supplierBookingRef.trim()) {
    return { ok: false, error: "Référence fournisseur manquante.", code: "INVALID_INPUT" }
  }
  if (!Number.isFinite(input.confirmedPrice) || input.confirmedPrice <= 0) {
    return { ok: false, error: "Prix confirmé invalide.", code: "INVALID_INPUT" }
  }
  return { ok: true }
}

/** Simulates the CAS claim: UPDATE ... WHERE status='PENDING' RETURNING */
function claimBookingCas(): boolean {
  if (fakeBooking.status !== "PENDING") return false
  fakeBooking.status = "BOOKING_IN_PROGRESS"
  reservationStatus = "on_request"
  statusTransitions.push("BOOKING_IN_PROGRESS")
  return true
}

async function finalizeFinancials(reservationId: string) {
  if (!fakeSnapshot) return
  financialsRecorded.push({
    reservationId,
    supplierPriceTnd: Number(fakeSnapshot.supplierAmount),
    salePriceTnd: Number(fakeSnapshot.sellingAmount),
  })
}

async function runManualConfirmation(
  role: string,
  reservationExists: boolean,
  input: ManualInput,
) {
  // 0. Auth guard — identical to the real FULFILL_ROLES check
  if (!(FULFILL_ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: "Permission insuffisante.", code: "FORBIDDEN" }
  }

  // 1. Input validation
  const validation = validateInput(input)
  if (!validation.ok) return validation

  // reservation existence check happens alongside the CAS claim in the real
  // code (SELECT after a failed claim) — modeled here explicitly.
  if (!reservationExists) {
    return { ok: false, error: "Réservation de vol introuvable.", code: "NOT_FOUND" }
  }

  // 2. Atomic CAS claim
  const claimed = claimBookingCas()
  if (!claimed) {
    return { ok: false, error: `Ce dossier est déjà en statut ${fakeBooking.status}.`, code: "WRONG_STATUS" }
  }

  // 3. Log B2B validation transaction — never mutates the snapshot
  transactionsLogged.push({
    type: "B2B_VALIDATION",
    response: {
      supplierBookingRef: input.supplierBookingRef,
      confirmedPrice: input.confirmedPrice,
    },
  })

  // 4. Confirm
  fakeBooking.supplierBookingRef = input.supplierBookingRef
  fakeBooking.fulfillmentMode = "b2b_offline"
  fakeBooking.status = "CONFIRMED"
  reservationStatus = "confirmed"
  statusTransitions.push("CONFIRMED")

  // 5. Single financial anchor
  await finalizeFinancials(fakeBooking.reservationId)

  return { ok: true, bookingId: fakeBooking.id }
}

/** Simulates the API_DIRECT path's Arm A claim winning first. */
function apiDirectConfirms() {
  fakeBooking.status = "BOOKING_IN_PROGRESS"
  fakeBooking.status = "CONFIRMED"
  fakeBooking.fulfillmentMode = "api_direct"
  statusTransitions.push("API_CONFIRMED")
}

describe("PROVIDER-CONNECTIVITY-BRIDGE — Manual B2B_OFFLINE confirmation", () => {
  beforeEach(() => resetState())

  test("M1 — nonexistent reservation → NOT_FOUND", async () => {
    const result = await runManualConfirmation("agent_resa", false, {
      supplierBookingRef: "REF123",
      confirmedPrice: 450,
    })
    assert.ok(!result.ok)
    assert.equal(result.code, "NOT_FOUND")
    assert.equal(statusTransitions.length, 0)
  })

  test("M2 — already-confirmed booking → WRONG_STATUS, no state change", async () => {
    fakeBooking.status = "CONFIRMED"
    const result = await runManualConfirmation("agent_resa", true, {
      supplierBookingRef: "REF123",
      confirmedPrice: 450,
    })
    assert.ok(!result.ok)
    assert.equal(result.code, "WRONG_STATUS")
    assert.equal(statusTransitions.length, 0)
    assert.equal(financialsRecorded.length, 0)
  })

  test("M3 — wrong staff role → FORBIDDEN, no DB write attempted", async () => {
    const result = await runManualConfirmation("agent_compta", true, {
      supplierBookingRef: "REF123",
      confirmedPrice: 450,
    })
    assert.ok(!result.ok)
    assert.equal(result.code, "FORBIDDEN")
    assert.equal(statusTransitions.length, 0)
    assert.equal(transactionsLogged.length, 0)
    assert.equal(fakeBooking.status, "PENDING", "booking untouched")
  })

  test("M4 — missing supplier reference → INVALID_INPUT", async () => {
    const result = await runManualConfirmation("agent_resa", true, {
      supplierBookingRef: "   ",
      confirmedPrice: 450,
    })
    assert.ok(!result.ok)
    assert.equal(result.code, "INVALID_INPUT")
    assert.equal(statusTransitions.length, 0)
  })

  test("M5 — invalid price (zero/negative) → INVALID_INPUT", async () => {
    const zero = await runManualConfirmation("agent_resa", true, {
      supplierBookingRef: "REF123",
      confirmedPrice: 0,
    })
    assert.ok(!zero.ok)
    assert.equal(zero.code, "INVALID_INPUT")

    resetState()
    const negative = await runManualConfirmation("agent_resa", true, {
      supplierBookingRef: "REF123",
      confirmedPrice: -10,
    })
    assert.ok(!negative.ok)
    assert.equal(negative.code, "INVALID_INPUT")
  })

  test("M6 — double confirmation: second call on same booking → WRONG_STATUS", async () => {
    const first = await runManualConfirmation("agent_resa", true, {
      supplierBookingRef: "REF123",
      confirmedPrice: 450,
    })
    assert.ok(first.ok)

    const second = await runManualConfirmation("agent_resa", true, {
      supplierBookingRef: "REF456",
      confirmedPrice: 460,
    })
    assert.ok(!second.ok)
    assert.equal(second.code, "WRONG_STATUS")

    // financials recorded exactly once despite two calls
    assert.equal(financialsRecorded.length, 1)
    // supplier ref from the first (winning) call must not be overwritten
    assert.equal(fakeBooking.supplierBookingRef, "REF123")
  })

  test("M7 — concurrent confirmation: only one CAS winner", async () => {
    // Simulate two operators racing on the same booking by claiming twice in
    // sequence within the same PENDING window (the CAS itself is what the
    // real UPDATE...WHERE status='PENDING' guarantees atomically in Postgres).
    const claimA = claimBookingCas()
    const claimB = claimBookingCas()
    assert.ok(claimA, "first operator wins the claim")
    assert.ok(!claimB, "second operator cannot claim an already-claimed booking")
  })

  test("M8 — API_DIRECT already confirmed → manual path loses the CAS", async () => {
    apiDirectConfirms()
    const result = await runManualConfirmation("agent_resa", true, {
      supplierBookingRef: "REF123",
      confirmedPrice: 450,
    })
    assert.ok(!result.ok)
    assert.equal(result.code, "WRONG_STATUS")
    assert.equal(fakeBooking.fulfillmentMode, "api_direct", "channel must remain api_direct, never overwritten")
    assert.equal(financialsRecorded.length, 0, "manual path must never double-write financials")
  })

  test("M9 — financials recorded exactly once on the happy path", async () => {
    await runManualConfirmation("agent_resa", true, {
      supplierBookingRef: "REF123",
      confirmedPrice: 450,
    })
    assert.equal(financialsRecorded.length, 1)
    assert.equal(financialsRecorded[0]?.reservationId, "reservation-uuid-001")
  })

  test("M10 — happy path: PENDING → CONFIRMED, b2b_offline, snapshot untouched", async () => {
    const result = await runManualConfirmation("manager", true, {
      supplierBookingRef: "SUP-REF-999",
      confirmedPrice: 430,
      confirmedCurrency: "TND",
      operatorNote: "Confirmé par téléphone avec le fournisseur.",
    })
    assert.ok(result.ok)
    assert.deepEqual(statusTransitions, ["BOOKING_IN_PROGRESS", "CONFIRMED"])
    assert.equal(fakeBooking.fulfillmentMode, "b2b_offline")
    assert.equal(fakeBooking.supplierBookingRef, "SUP-REF-999")
    assert.equal(reservationStatus, "confirmed")

    const logged = transactionsLogged.find((t) => t.type === "B2B_VALIDATION")
    assert.ok(logged, "B2B_VALIDATION transaction logged")
    assert.equal(logged?.response.supplierBookingRef, "SUP-REF-999")

    // Snapshot (supplierAmount/sellingAmount) must never be rewritten — the
    // B2B validated price is journaled separately, never overwriting the
    // immutable price snapshot.
    assert.equal(fakeSnapshot.mutated, false)
    assert.equal(fakeSnapshot.supplierAmount, "420.000")
  })
})
