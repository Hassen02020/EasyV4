import test from "node:test"
import assert from "node:assert/strict"
import { VirtualPaymentProvider, isVirtualPaymentModeEnabled } from "../virtual-payment-provider"
import { getPaymentProvider } from "../provider"

test("VirtualPaymentProvider.createPayment : ne confirme jamais de façon synchrone — requires_action + redirectUrl", async () => {
  const provider = new VirtualPaymentProvider()
  const result = await provider.createPayment({
    amountTnd: 150,
    currency: "TND",
    reference: "guest-abc-123",
    description: "Réservation hôtel — test",
    customerEmail: "client@example.com",
  })
  assert.equal(result.ok, true)
  assert.equal(result.status, "requires_action")
  assert.equal(result.psp, "virtual")
  assert.equal(result.redirectUrl, "/paiement-simule/guest-abc-123")
})

test("VirtualPaymentProvider : confirmPayment/refundPayment/getPaymentStatus n'inventent jamais de succès (seul le webhook confirme)", async () => {
  const provider = new VirtualPaymentProvider()
  assert.equal((await provider.confirmPayment()).ok, false)
  assert.equal((await provider.refundPayment()).ok, false)
  assert.equal((await provider.getPaymentStatus()).found, false)
})

test("isVirtualPaymentModeEnabled : jamais vrai sans PAYMENT_MODE=virtual explicite", () => {
  const original = process.env.PAYMENT_MODE
  try {
    delete process.env.PAYMENT_MODE
    assert.equal(isVirtualPaymentModeEnabled(), false)
    process.env.PAYMENT_MODE = "live"
    assert.equal(isVirtualPaymentModeEnabled(), false)
    process.env.PAYMENT_MODE = "virtual"
    assert.equal(isVirtualPaymentModeEnabled(), true)
  } finally {
    if (original === undefined) delete process.env.PAYMENT_MODE
    else process.env.PAYMENT_MODE = original
  }
})

test("isVirtualPaymentModeEnabled : PAYMENT_MODE=virtual + NODE_ENV=production => throw (garde-fou production)", () => {
  const env = process.env as Record<string, string | undefined>
  const originalMode = env.PAYMENT_MODE
  const originalEnv = env.NODE_ENV
  try {
    env.PAYMENT_MODE = "virtual"
    env.NODE_ENV = "production"
    assert.throws(() => isVirtualPaymentModeEnabled(), /interdit en production/)
  } finally {
    if (originalMode === undefined) delete env.PAYMENT_MODE
    else env.PAYMENT_MODE = originalMode
    if (originalEnv === undefined) delete env.NODE_ENV
    else env.NODE_ENV = originalEnv
  }
})

test("getPaymentProvider : sélectionne VirtualPaymentProvider seulement quand PAYMENT_MODE=virtual, jamais par défaut", () => {
  const original = process.env.PAYMENT_MODE
  try {
    delete process.env.PAYMENT_MODE
    assert.equal(getPaymentProvider().name, "not_configured")
    process.env.PAYMENT_MODE = "virtual"
    assert.equal(getPaymentProvider().name, "virtual")
  } finally {
    if (original === undefined) delete process.env.PAYMENT_MODE
    else process.env.PAYMENT_MODE = original
  }
})
