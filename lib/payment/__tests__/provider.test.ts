/**
 * Tests unitaires — `lib/payment/provider.ts`.
 *
 * Objectif : garantir qu'en l'absence de fournisseur de paiement réel
 * configuré (`STRIPE_SECRET_KEY` / `SPS_SECRET_KEY`), l'abstraction
 * `PaymentProvider` renvoie honnêtement `PAYMENT_PROVIDER_NOT_CONFIGURED`
 * sur chaque opération — jamais un faux `SUCCESS`.
 */

import test, { before, after } from "node:test"
import assert from "node:assert/strict"

import {
  getPaymentProvider,
  hasConfiguredPaymentProvider,
} from "@/lib/payment/provider"

// Ce fichier teste spécifiquement le comportement "non configuré" par
// défaut — indépendant de PAYMENT_MODE=virtual (Virtual Payment Provider,
// test/dev uniquement, voir lib/payment/virtual-payment-provider.ts), qui
// peut être posé dans l'environnement de test local (.env.local) sans
// rapport avec ce que CE fichier vérifie.
let savedPaymentMode: string | undefined
before(() => {
  savedPaymentMode = process.env.PAYMENT_MODE
  delete process.env.PAYMENT_MODE
})
after(() => {
  if (savedPaymentMode !== undefined) process.env.PAYMENT_MODE = savedPaymentMode
})

test("getPaymentProvider() : renvoie un provider non configuré tant qu'aucune clé n'est présente", () => {
  const savedStripe = process.env.STRIPE_SECRET_KEY
  const savedSps = process.env.SPS_SECRET_KEY
  delete process.env.STRIPE_SECRET_KEY
  delete process.env.SPS_SECRET_KEY
  try {
    const provider = getPaymentProvider()
    assert.equal(provider.configured, false)
    assert.equal(provider.name, "not_configured")
  } finally {
    if (savedStripe !== undefined) process.env.STRIPE_SECRET_KEY = savedStripe
    if (savedSps !== undefined) process.env.SPS_SECRET_KEY = savedSps
  }
})

test("hasConfiguredPaymentProvider() : false quand aucune clé n'est définie", () => {
  const savedStripe = process.env.STRIPE_SECRET_KEY
  const savedSps = process.env.SPS_SECRET_KEY
  delete process.env.STRIPE_SECRET_KEY
  delete process.env.SPS_SECRET_KEY
  try {
    assert.equal(hasConfiguredPaymentProvider(), false)
  } finally {
    if (savedStripe !== undefined) process.env.STRIPE_SECRET_KEY = savedStripe
    if (savedSps !== undefined) process.env.SPS_SECRET_KEY = savedSps
  }
})

test("hasConfiguredPaymentProvider() : true dès qu'une clé Stripe ou SPS est présente", () => {
  const savedStripe = process.env.STRIPE_SECRET_KEY
  const savedSps = process.env.SPS_SECRET_KEY
  delete process.env.SPS_SECRET_KEY
  process.env.STRIPE_SECRET_KEY = "sk_test_fake"
  try {
    assert.equal(hasConfiguredPaymentProvider(), true)
  } finally {
    if (savedStripe === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = savedStripe
    if (savedSps !== undefined) process.env.SPS_SECRET_KEY = savedSps
  }
})

test("createPayment() : jamais de faux succès — code PAYMENT_PROVIDER_NOT_CONFIGURED explicite", async () => {
  const provider = getPaymentProvider()
  const result = await provider.createPayment({
    amountTnd: 700,
    currency: "TND",
    reference: "test-ref",
    description: "test",
    customerEmail: "client@example.com",
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, "PAYMENT_PROVIDER_NOT_CONFIGURED")
  assert.ok(result.message && result.message.length > 0)
})

test("confirmPayment() : jamais de faux succès", async () => {
  const provider = getPaymentProvider()
  const result = await provider.confirmPayment("fake-payment-id")
  assert.equal(result.ok, false)
  assert.equal(result.code, "PAYMENT_PROVIDER_NOT_CONFIGURED")
})

test("refundPayment() : jamais de faux succès", async () => {
  const provider = getPaymentProvider()
  const result = await provider.refundPayment("fake-payment-id")
  assert.equal(result.ok, false)
  assert.equal(result.code, "PAYMENT_PROVIDER_NOT_CONFIGURED")
})

test("getPaymentStatus() : found=false — aucune transaction fantôme n'est jamais rapportée", async () => {
  const provider = getPaymentProvider()
  const result = await provider.getPaymentStatus("fake-payment-id")
  assert.equal(result.found, false)
  assert.equal(result.status, undefined)
})
