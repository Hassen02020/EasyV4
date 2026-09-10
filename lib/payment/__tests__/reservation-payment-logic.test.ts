import test from "node:test"
import assert from "node:assert/strict"
import { matchesPendingPayment } from "../reservation-payment-logic"
import type { NormalizedChargeEvent } from "../webhook-logic"

function charge(overrides: Partial<NormalizedChargeEvent> = {}): NormalizedChargeEvent {
  return {
    eventId: "evt_1",
    eventType: "payment_intent.succeeded",
    providerRef: "ref-abc",
    amountTnd: 150,
    currency: "TND",
    ...overrides,
  }
}

const payment = {
  pspOrderId: "ref-abc",
  originalAmount: "150.00",
  originalCurrency: "TND",
}

test("matchesPendingPayment : correspondance exacte -> ok", () => {
  const result = matchesPendingPayment(payment, charge())
  assert.deepEqual(result, { ok: true })
})

test("matchesPendingPayment : référence différente -> REFERENCE_MISMATCH", () => {
  const result = matchesPendingPayment(payment, charge({ providerRef: "ref-other" }))
  assert.deepEqual(result, { ok: false, reason: "REFERENCE_MISMATCH" })
})

test("matchesPendingPayment : pspOrderId absent (jamais posé) -> REFERENCE_MISMATCH", () => {
  const result = matchesPendingPayment({ ...payment, pspOrderId: null }, charge())
  assert.deepEqual(result, { ok: false, reason: "REFERENCE_MISMATCH" })
})

test("matchesPendingPayment : devise différente -> CURRENCY_MISMATCH", () => {
  const result = matchesPendingPayment(payment, charge({ currency: "EUR" }))
  assert.deepEqual(result, { ok: false, reason: "CURRENCY_MISMATCH" })
})

test("matchesPendingPayment : montant différent -> AMOUNT_MISMATCH", () => {
  const result = matchesPendingPayment(payment, charge({ amountTnd: 999 }))
  assert.deepEqual(result, { ok: false, reason: "AMOUNT_MISMATCH" })
})

test("matchesPendingPayment : écart flottant négligeable (<0.001) -> ok", () => {
  const result = matchesPendingPayment(payment, charge({ amountTnd: 150.0001 }))
  assert.deepEqual(result, { ok: true })
})

test("matchesPendingPayment : montant attendu non numérique -> AMOUNT_MISMATCH, jamais une exception", () => {
  const result = matchesPendingPayment({ ...payment, originalAmount: "not-a-number" }, charge())
  assert.deepEqual(result, { ok: false, reason: "AMOUNT_MISMATCH" })
})
