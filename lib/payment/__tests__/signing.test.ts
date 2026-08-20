import test from "node:test"
import assert from "node:assert/strict"

import {
  buildStripeSignatureHeader,
  computeSpsSeal,
  verifySpsSignature,
  verifyStripeSignature,
} from "../signing"

test("Stripe : une signature valide passe la vérification", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" })
  const secret = "whsec_test"
  const header = buildStripeSignatureHeader(payload, secret)
  assert.equal(verifyStripeSignature(Buffer.from(payload), header, secret), true)
})

test("Stripe : un mauvais secret échoue", () => {
  const payload = JSON.stringify({ id: "evt_1" })
  const header = buildStripeSignatureHeader(payload, "whsec_real")
  assert.equal(verifyStripeSignature(Buffer.from(payload), header, "whsec_wrong"), false)
})

test("Stripe : un payload altéré après signature échoue", () => {
  const secret = "whsec_test"
  const header = buildStripeSignatureHeader(JSON.stringify({ id: "evt_1" }), secret)
  const tampered = JSON.stringify({ id: "evt_1_TAMPERED" })
  assert.equal(verifyStripeSignature(Buffer.from(tampered), header, secret), false)
})

test("Stripe : header absent échoue", () => {
  assert.equal(verifyStripeSignature(Buffer.from("{}"), null, "whsec_test"), false)
})

test("SPS : un seal valide passe la vérification", () => {
  const secret = "sps_secret"
  const body: Record<string, string> = { transaction_id: "tx_1", amount: "150.000", currency: "TND" }
  body.seal = computeSpsSeal(body, secret)
  assert.equal(verifySpsSignature(body, secret), true)
})

test("SPS : un champ altéré après signature échoue", () => {
  const secret = "sps_secret"
  const body: Record<string, string> = { transaction_id: "tx_1", amount: "150.000", currency: "TND" }
  body.seal = computeSpsSeal(body, secret)
  body.amount = "1.000"
  assert.equal(verifySpsSignature(body, secret), false)
})

test("SPS : seal absent échoue", () => {
  assert.equal(verifySpsSignature({ transaction_id: "tx_1" }, "sps_secret"), false)
})
