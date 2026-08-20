import test from "node:test"
import assert from "node:assert/strict"

import {
  classifyEventType,
  normalizeStripeEvent,
  normalizeSpsEvent,
  matchesPendingRecharge,
} from "../webhook-logic"

test("classifyEventType : mappe les types Stripe/SPS connus", () => {
  assert.equal(classifyEventType("payment_intent.succeeded"), "succeeded")
  assert.equal(classifyEventType("charge.captured"), "succeeded")
  assert.equal(classifyEventType("sps.payment.captured"), "succeeded")
  assert.equal(classifyEventType("payment_intent.payment_failed"), "failed")
  assert.equal(classifyEventType("sps.payment.refused"), "failed")
  assert.equal(classifyEventType("charge.refunded"), "refunded")
  assert.equal(classifyEventType("sps.payment.refunded"), "refunded")
  assert.equal(classifyEventType("customer.created"), "unknown")
})

test("normalizeStripeEvent : parse un événement valide", () => {
  const event = normalizeStripeEvent({
    id: "evt_123",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_abc", amount_tnd: "150.000", currency: "tnd" } },
  })
  assert.ok(event)
  assert.equal(event?.eventId, "evt_123")
  assert.equal(event?.providerRef, "pi_abc")
  assert.equal(event?.amountTnd, 150)
  assert.equal(event?.currency, "TND")
})

test("normalizeStripeEvent : accepte amount_tnd numérique", () => {
  const event = normalizeStripeEvent({
    id: "evt_1",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_1", amount_tnd: 42.5, currency: "TND" } },
  })
  assert.equal(event?.amountTnd, 42.5)
})

test("normalizeStripeEvent : rejette un payload malformé (champ manquant)", () => {
  assert.equal(
    normalizeStripeEvent({ id: "evt_1", type: "payment_intent.succeeded", data: { object: { id: "pi_1" } } }),
    null,
  )
})

test("normalizeStripeEvent : rejette amount_tnd non numérique", () => {
  assert.equal(
    normalizeStripeEvent({
      id: "evt_1",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_1", amount_tnd: "not-a-number", currency: "TND" } },
    }),
    null,
  )
})

test("normalizeStripeEvent : rejette un objet complètement différent", () => {
  assert.equal(normalizeStripeEvent({ foo: "bar" }), null)
  assert.equal(normalizeStripeEvent(null), null)
  assert.equal(normalizeStripeEvent("string"), null)
})

test("normalizeSpsEvent : parse un payload form-urlencoded valide", () => {
  const event = normalizeSpsEvent(
    { transaction_id: "sps_tx_1", amount: "75.500", currency: "TND", seal: "ignored" },
    "sps.payment.captured",
  )
  assert.ok(event)
  assert.equal(event?.providerRef, "sps_tx_1")
  assert.equal(event?.amountTnd, 75.5)
  assert.equal(event?.eventId, "sps_tx_1")
})

test("normalizeSpsEvent : rejette un payload incomplet", () => {
  assert.equal(normalizeSpsEvent({ transaction_id: "sps_tx_1" }, "sps.payment.captured"), null)
  assert.equal(normalizeSpsEvent({ amount: "abc", transaction_id: "x", currency: "TND" }, "sps.payment.captured"), null)
})

test("matchesPendingRecharge : accepte quand référence/devise/montant correspondent", () => {
  const result = matchesPendingRecharge(
    { amount: "150.000", paymentReference: "pi_abc" },
    { eventId: "evt_1", eventType: "payment_intent.succeeded", providerRef: "pi_abc", amountTnd: 150, currency: "TND" },
  )
  assert.deepEqual(result, { ok: true })
})

test("matchesPendingRecharge : rejette une référence PSP différente (anti-usurpation)", () => {
  const result = matchesPendingRecharge(
    { amount: "150.000", paymentReference: "pi_abc" },
    { eventId: "evt_1", eventType: "payment_intent.succeeded", providerRef: "pi_OTHER", amountTnd: 150, currency: "TND" },
  )
  assert.deepEqual(result, { ok: false, reason: "REFERENCE_MISMATCH" })
})

test("matchesPendingRecharge : rejette une demande sans paymentReference posé", () => {
  const result = matchesPendingRecharge(
    { amount: "150.000", paymentReference: null },
    { eventId: "evt_1", eventType: "payment_intent.succeeded", providerRef: "pi_abc", amountTnd: 150, currency: "TND" },
  )
  assert.deepEqual(result, { ok: false, reason: "REFERENCE_MISMATCH" })
})

test("matchesPendingRecharge : rejette une devise différente de TND", () => {
  const result = matchesPendingRecharge(
    { amount: "150.000", paymentReference: "pi_abc" },
    { eventId: "evt_1", eventType: "payment_intent.succeeded", providerRef: "pi_abc", amountTnd: 150, currency: "EUR" },
  )
  assert.deepEqual(result, { ok: false, reason: "CURRENCY_MISMATCH" })
})

test("matchesPendingRecharge : rejette un montant PSP différent du montant demandé (anti-tampering)", () => {
  const result = matchesPendingRecharge(
    { amount: "150.000", paymentReference: "pi_abc" },
    { eventId: "evt_1", eventType: "payment_intent.succeeded", providerRef: "pi_abc", amountTnd: 1, currency: "TND" },
  )
  assert.deepEqual(result, { ok: false, reason: "AMOUNT_MISMATCH" })
})

test("matchesPendingRecharge : tolère l'arrondi flottant sous le millime", () => {
  const result = matchesPendingRecharge(
    { amount: "150.000", paymentReference: "pi_abc" },
    { eventId: "evt_1", eventType: "payment_intent.succeeded", providerRef: "pi_abc", amountTnd: 150.0001, currency: "TND" },
  )
  assert.deepEqual(result, { ok: true })
})
