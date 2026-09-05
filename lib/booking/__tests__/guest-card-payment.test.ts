/**
 * Tests unitaires — `lib/booking/guest-card-payment.ts`.
 *
 * Défaut Phase 15 corrigé : `provider.createPayment()` qui LÈVE (timeout
 * réseau, etc.) au lieu de renvoyer `{ok:false}` doit déclencher la même
 * compensation myGo qu'un échec propre — jamais de réservation fournisseur
 * orpheline, jamais d'exception qui s'échappe.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { attemptCardPayment, generateGuestPaymentReference } from "../guest-card-payment"
import type { PaymentProvider, PaymentResult } from "@/lib/payment/provider"

const BASE_INPUT = {
  amountTnd: 1200,
  currency: "TND" as const,
  reference: "guest-test-ref",
  description: "Réservation hôtel — test",
  customerEmail: "client@example.com",
}

function makeProvider(behavior: { result?: PaymentResult; throws?: Error }): PaymentProvider {
  return {
    name: "fake",
    configured: true,
    async createPayment() {
      if (behavior.throws) throw behavior.throws
      return behavior.result!
    },
    async confirmPayment() {
      return { ok: false }
    },
    async refundPayment() {
      return { ok: false }
    },
    async getPaymentStatus() {
      return { found: false }
    },
  }
}

test("attemptCardPayment : succès — pas de compensation, résultat propagé tel quel", async () => {
  let compensateCalled = false
  const provider = makeProvider({ result: { ok: true, providerPaymentId: "pi_test", status: "succeeded" } })

  const result = await attemptCardPayment(provider, BASE_INPUT, async () => {
    compensateCalled = true
  })

  assert.deepEqual(result, { ok: true, providerPaymentId: "pi_test", status: "succeeded" })
  assert.equal(compensateCalled, false, "aucune compensation myGo ne doit avoir lieu sur un succès")
})

test("attemptCardPayment : échec propre du provider — compensation déclenchée, résultat propagé", async () => {
  let compensateCalled = false
  const provider = makeProvider({ result: { ok: false, code: "PAYMENT_DECLINED", message: "Carte refusée" } })

  const result = await attemptCardPayment(provider, BASE_INPUT, async () => {
    compensateCalled = true
  })

  assert.equal(result.ok, false)
  assert.equal(result.code, "PAYMENT_DECLINED")
  assert.equal(compensateCalled, true, "la réservation myGo doit être compensée sur un échec de paiement")
})

test("attemptCardPayment : le provider LÈVE une exception (timeout réseau) — compensation quand même déclenchée, jamais d'exception qui s'échappe", async () => {
  let compensateCalled = false
  const provider = makeProvider({ throws: new Error("fetch failed: ETIMEDOUT") })

  const result = await attemptCardPayment(provider, BASE_INPUT, async () => {
    compensateCalled = true
  })

  assert.equal(result.ok, false)
  assert.equal(result.code, "PROVIDER_ERROR")
  assert.match(result.message ?? "", /ETIMEDOUT/)
  assert.equal(compensateCalled, true, "un timeout provider doit compenser myGo exactement comme un échec propre")
})

test("attemptCardPayment : un échec de compensation (myGo indisponible) ne masque jamais l'échec du paiement d'origine", async () => {
  const provider = makeProvider({ result: { ok: false, code: "PAYMENT_DECLINED", message: "Carte refusée" } })

  const result = await attemptCardPayment(provider, BASE_INPUT, async () => {
    throw new Error("myGo cancelBooking indisponible")
  })

  assert.equal(result.ok, false)
  assert.equal(result.code, "PAYMENT_DECLINED", "le code d'échec du paiement d'origine doit rester intact")
})

test("attemptCardPayment : un échec de compensation après une exception provider ne masque pas non plus PROVIDER_ERROR", async () => {
  const provider = makeProvider({ throws: new Error("réseau indisponible") })

  const result = await attemptCardPayment(provider, BASE_INPUT, async () => {
    throw new Error("myGo cancelBooking indisponible aussi")
  })

  assert.equal(result.ok, false)
  assert.equal(result.code, "PROVIDER_ERROR")
})

test("attemptCardPayment : requires_action (paiement redirect-based) — redirectUrl/psp propagés tels quels", async () => {
  const provider = makeProvider({
    result: {
      ok: true,
      status: "requires_action",
      providerPaymentId: "guest-test-ref",
      psp: "virtual",
      redirectUrl: "/paiement-simule/guest-test-ref",
    },
  })

  const result = await attemptCardPayment(provider, BASE_INPUT, async () => {})

  assert.equal(result.ok, true)
  assert.equal(result.status, "requires_action")
  assert.equal(result.redirectUrl, "/paiement-simule/guest-test-ref")
  assert.equal(result.psp, "virtual")
})

test("generateGuestPaymentReference : références uniques, préfixées 'guest-'", () => {
  const a = generateGuestPaymentReference()
  const b = generateGuestPaymentReference()
  assert.notEqual(a, b)
  assert.match(a, /^guest-[0-9a-f-]{36}$/)
})
