import test from "node:test"
import assert from "node:assert/strict"

import {
  buildStripeSignatureHeader,
  computeSpsSeal,
  verifySpsSignature,
  verifyStripeSignature,
} from "../signing"

test("Stripe : une signature valide passe la vérification", () => {
  const payload = JSON.stringify({
    id: "evt_1",
    type: "payment_intent.succeeded",
  })
  const secret = "whsec_test"
  const header = buildStripeSignatureHeader(payload, secret)
  assert.equal(
    verifyStripeSignature(Buffer.from(payload), header, secret),
    true,
  )
})

test("Stripe : un mauvais secret échoue", () => {
  const payload = JSON.stringify({ id: "evt_1" })
  const header = buildStripeSignatureHeader(payload, "whsec_real")
  assert.equal(
    verifyStripeSignature(Buffer.from(payload), header, "whsec_wrong"),
    false,
  )
})

test("Stripe : un payload altéré après signature échoue", () => {
  const secret = "whsec_test"
  const header = buildStripeSignatureHeader(
    JSON.stringify({ id: "evt_1" }),
    secret,
  )
  const tampered = JSON.stringify({ id: "evt_1_TAMPERED" })
  assert.equal(
    verifyStripeSignature(Buffer.from(tampered), header, secret),
    false,
  )
})

test("Stripe : header absent échoue", () => {
  assert.equal(
    verifyStripeSignature(Buffer.from("{}"), null, "whsec_test"),
    false,
  )
})

test("SPS : un seal valide passe la vérification", () => {
  const secret = "sps_secret"
  const body: Record<string, string> = {
    transaction_id: "tx_1",
    amount: "150.000",
    currency: "TND",
  }
  body.seal = computeSpsSeal(body, secret)
  assert.equal(verifySpsSignature(body, secret), true)
})

test("SPS : un champ altéré après signature échoue", () => {
  const secret = "sps_secret"
  const body: Record<string, string> = {
    transaction_id: "tx_1",
    amount: "150.000",
    currency: "TND",
  }
  body.seal = computeSpsSeal(body, secret)
  body.amount = "1.000"
  assert.equal(verifySpsSignature(body, secret), false)
})

test("SPS : seal absent échoue", () => {
  assert.equal(
    verifySpsSignature({ transaction_id: "tx_1" }, "sps_secret"),
    false,
  )
})

/* ------------------------------------------------------------------ */
/* PAY-WEBHOOK-SAFETY-01 / P1-D — fenêtre temporelle Stripe           */
/* ------------------------------------------------------------------ */

import { STRIPE_SIGNATURE_MAX_AGE_SECONDS } from "../signing"

test("Stripe : signature récente (dans la fenêtre) passe", () => {
  const payload = JSON.stringify({ id: "evt_fresh", type: "payment_intent.succeeded" })
  const secret = "whsec_test"
  const now = Math.floor(Date.now() / 1000)
  const header = buildStripeSignatureHeader(payload, secret, now)
  assert.equal(
    verifyStripeSignature(Buffer.from(payload), header, secret, now),
    true,
  )
})

test("Stripe : signature expirée (au-delà de la fenêtre) est rejetée", () => {
  const payload = JSON.stringify({ id: "evt_old", type: "payment_intent.succeeded" })
  const secret = "whsec_test"
  const expiredTs = Math.floor(Date.now() / 1000) - STRIPE_SIGNATURE_MAX_AGE_SECONDS - 1
  const header = buildStripeSignatureHeader(payload, secret, expiredTs)
  const now = Math.floor(Date.now() / 1000)
  assert.equal(
    verifyStripeSignature(Buffer.from(payload), header, secret, now),
    false,
  )
})

test("Stripe : timestamp dans le futur (dérive malveillante) est rejeté", () => {
  const payload = JSON.stringify({ id: "evt_future", type: "payment_intent.succeeded" })
  const secret = "whsec_test"
  const futureTs = Math.floor(Date.now() / 1000) + STRIPE_SIGNATURE_MAX_AGE_SECONDS + 1
  const header = buildStripeSignatureHeader(payload, secret, futureTs)
  const now = Math.floor(Date.now() / 1000)
  assert.equal(
    verifyStripeSignature(Buffer.from(payload), header, secret, now),
    false,
  )
})

test("Stripe : timestamp malformé (non numérique) est rejeté", () => {
  const payload = JSON.stringify({ id: "evt_bad_ts" })
  const secret = "whsec_test"
  // Header avec timestamp non numérique
  const badHeader = `t=notanumber,v1=abc123`
  assert.equal(
    verifyStripeSignature(Buffer.from(payload), badHeader, secret),
    false,
  )
})
