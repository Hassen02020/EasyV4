/**
 * Preuve d'intégration bout-en-bout (sans DB) : chaque scénario du Virtual
 * Payment Provider, une fois généré, est repassé exactement dans le même
 * pipeline que la vraie route (vérification signature → parsing →
 * classification → matching) — pas une resimulation séparée.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { buildVirtualWebhookRequest } from "../virtual-provider"
import { verifySpsSignature, verifyStripeSignature } from "../signing"
import { classifyEventType, matchesPendingRecharge, normalizeSpsEvent, normalizeStripeEvent } from "../webhook-logic"

const PENDING_REQUEST = { amount: "150.000", paymentReference: "pi_test_ref_1" }
const STRIPE_SECRET = "whsec_virtual_test"
const SPS_SECRET = "sps_virtual_test"

function verifyAndParse(
  req: ReturnType<typeof buildVirtualWebhookRequest>,
  provider: "stripe" | "sps",
  secret: string,
) {
  if (provider === "stripe") {
    const sigOk = verifyStripeSignature(Buffer.from(req.body), req.headers["stripe-signature"] ?? null, secret)
    const charge = sigOk ? normalizeStripeEvent(JSON.parse(req.body)) : null
    const eventType = JSON.parse(req.body).type as string
    return { sigOk, charge, eventType }
  }
  const body = Object.fromEntries(new URLSearchParams(req.body))
  const sigOk = verifySpsSignature(body, secret)
  const eventType = body["event_type"]
  const charge = sigOk ? normalizeSpsEvent(body, eventType) : null
  return { sigOk, charge, eventType }
}

for (const provider of ["stripe", "sps"] as const) {
  const secret = provider === "stripe" ? STRIPE_SECRET : SPS_SECRET

  test(`[${provider}] CARD_SUCCESS : signature valide, montant/devise/référence correspondent`, () => {
    const req = buildVirtualWebhookRequest("CARD_SUCCESS", {
      provider,
      providerRef: PENDING_REQUEST.paymentReference,
      amountTnd: 150,
      secret,
    })
    const { sigOk, charge, eventType } = verifyAndParse(req, provider, secret)
    assert.equal(sigOk, true)
    assert.equal(classifyEventType(eventType), "succeeded")
    assert.ok(charge)
    assert.deepEqual(matchesPendingRecharge(PENDING_REQUEST, charge!), { ok: true })
  })

  test(`[${provider}] CARD_DECLINED : classifié failed`, () => {
    const req = buildVirtualWebhookRequest("CARD_DECLINED", {
      provider,
      providerRef: PENDING_REQUEST.paymentReference,
      amountTnd: 150,
      secret,
    })
    const { sigOk, eventType } = verifyAndParse(req, provider, secret)
    assert.equal(sigOk, true)
    assert.equal(classifyEventType(eventType), "failed")
  })

  test(`[${provider}] INVALID_SIGNATURE : rejetée avant même le parsing`, () => {
    const req = buildVirtualWebhookRequest("INVALID_SIGNATURE", {
      provider,
      providerRef: PENDING_REQUEST.paymentReference,
      amountTnd: 150,
      secret,
    })
    const { sigOk } = verifyAndParse(req, provider, secret)
    assert.equal(sigOk, false)
  })

  test(`[${provider}] WRONG_AMOUNT : signature valide mais montant ne correspond pas (rejeté par matching, pas par signature)`, () => {
    const req = buildVirtualWebhookRequest("WRONG_AMOUNT", {
      provider,
      providerRef: PENDING_REQUEST.paymentReference,
      amountTnd: 150,
      secret,
    })
    const { sigOk, charge } = verifyAndParse(req, provider, secret)
    assert.equal(sigOk, true)
    assert.ok(charge)
    assert.deepEqual(matchesPendingRecharge(PENDING_REQUEST, charge!), { ok: false, reason: "AMOUNT_MISMATCH" })
  })

  test(`[${provider}] WRONG_CURRENCY : rejeté par matching (CURRENCY_MISMATCH)`, () => {
    const req = buildVirtualWebhookRequest("WRONG_CURRENCY", {
      provider,
      providerRef: PENDING_REQUEST.paymentReference,
      amountTnd: 150,
      secret,
    })
    const { charge } = verifyAndParse(req, provider, secret)
    assert.ok(charge)
    assert.deepEqual(matchesPendingRecharge(PENDING_REQUEST, charge!), { ok: false, reason: "CURRENCY_MISMATCH" })
  })

  test(`[${provider}] UNKNOWN_REFERENCE : ne correspond à aucune demande connue (REFERENCE_MISMATCH)`, () => {
    const req = buildVirtualWebhookRequest("UNKNOWN_REFERENCE", {
      provider,
      providerRef: PENDING_REQUEST.paymentReference,
      amountTnd: 150,
      secret,
    })
    const { charge } = verifyAndParse(req, provider, secret)
    assert.ok(charge)
    assert.notEqual(charge!.providerRef, PENDING_REQUEST.paymentReference)
    assert.deepEqual(matchesPendingRecharge(PENDING_REQUEST, charge!), { ok: false, reason: "REFERENCE_MISMATCH" })
  })

  test(`[${provider}] REFUND : classifié refunded`, () => {
    const req = buildVirtualWebhookRequest("REFUND", {
      provider,
      providerRef: PENDING_REQUEST.paymentReference,
      amountTnd: 150,
      secret,
    })
    const { sigOk, eventType } = verifyAndParse(req, provider, secret)
    assert.equal(sigOk, true)
    assert.equal(classifyEventType(eventType), "refunded")
  })

  test(`[${provider}] UNKNOWN_EVENT_TYPE : classifié unknown, ignoré sans erreur`, () => {
    const req = buildVirtualWebhookRequest("UNKNOWN_EVENT_TYPE", {
      provider,
      providerRef: PENDING_REQUEST.paymentReference,
      amountTnd: 150,
      secret,
    })
    const { sigOk, eventType } = verifyAndParse(req, provider, secret)
    assert.equal(sigOk, true)
    assert.equal(classifyEventType(eventType), "unknown")
  })

  test(`[${provider}] DUPLICATE_WEBHOOK : même requête postée deux fois garde le même eventId`, () => {
    const req = buildVirtualWebhookRequest("CARD_SUCCESS", {
      provider,
      providerRef: PENDING_REQUEST.paymentReference,
      amountTnd: 150,
      secret,
      eventId: "fixed-event-id-for-dup-test",
    })
    const first = verifyAndParse(req, provider, secret)
    const second = verifyAndParse(req, provider, secret)
    assert.equal(first.charge?.eventId, second.charge?.eventId)
    assert.equal(first.charge?.eventId, "fixed-event-id-for-dup-test")
  })
}
