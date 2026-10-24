/**
 * B2C-WALLET-EMAIL-01 — invariants statiques
 *
 * Vérifie le câblage complet de la notification email B2C après
 * validation d'une recharge wallet via Paymee :
 *   webhook route → sendEvent("wallet/customer.credited") → handler Inngest
 *
 * Invariants :
 * 1. Event "wallet/customer.credited" déclaré dans lib/inngest/client.ts
 * 2. Handler processWalletCustomerCredited exporté depuis index.ts
 * 3. Handler écoute "wallet/customer.credited" (triggers binding)
 * 4. customerId dans le payload event (jamais l'email en clair dans l'event)
 * 5. Guard no_customer_email : skip si email absent en DB
 * 6. Guard resend_not_configured : skip si RESEND_API_KEY absent
 * 7. sendEvent("wallet/customer.credited") dans webhook/route.ts
 * 8. sendEvent conditionné sur b2cResult.status === "credited"
 * 9. fire-and-forget .catch() dans webhook/route.ts
 * 10. Lookup email depuis customers table (jamais payload direct)
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const clientSrc = readFileSync(join(ROOT, "lib/inngest/client.ts"), "utf8")
const indexSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/index.ts"),
  "utf8",
)
const handlerSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/process-wallet-customer-credited.ts"),
  "utf8",
)
const webhookSrc = readFileSync(
  join(ROOT, "app/api/payment/webhook/route.ts"),
  "utf8",
)
const routeSrc = readFileSync(join(ROOT, "app/api/inngest/route.ts"), "utf8")

// ─── 1. Event type déclaré dans client.ts ────────────────────────────────────

test("B2C-WALLET-EMAIL-01: event wallet/customer.credited déclaré dans client.ts", () => {
  assert.match(clientSrc, /["']wallet\/customer\.credited["']/)
})

// ─── 2. Handler exporté depuis barrel index.ts ───────────────────────────────

test("B2C-WALLET-EMAIL-01: processWalletCustomerCredited exporté depuis index.ts", () => {
  assert.match(indexSrc, /export\s*\{[^}]*processWalletCustomerCredited[^}]*\}/)
})

// ─── 3. Triggers binding dans le handler ─────────────────────────────────────

test("B2C-WALLET-EMAIL-01: handler écoute wallet/customer.credited (triggers binding)", () => {
  assert.match(
    handlerSrc,
    /triggers[^}]{0,50}event:\s*["']wallet\/customer\.credited["']/,
  )
})

// ─── 4. customerId dans le payload event (pas l'email) ───────────────────────

test("B2C-WALLET-EMAIL-01: payload event contient customerId txId amount newBalance", () => {
  const idx = clientSrc.indexOf("wallet/customer.credited")
  const block = clientSrc.slice(idx, idx + 300)
  assert.match(block, /customerId/)
  assert.match(block, /txId/)
  assert.match(block, /amount/)
  assert.match(block, /newBalance/)
  // email NE doit PAS être dans le payload event
  assert.doesNotMatch(block, /customerEmail/)
})

// ─── 5. Guard no_customer_email ──────────────────────────────────────────────

test("B2C-WALLET-EMAIL-01: guard no_customer_email si email absent en DB", () => {
  assert.match(handlerSrc, /no_customer_email/)
})

// ─── 6. Guard resend_not_configured ──────────────────────────────────────────

test("B2C-WALLET-EMAIL-01: guard resend_not_configured si RESEND_API_KEY absent", () => {
  assert.match(handlerSrc, /resend_not_configured/)
})

// ─── 7. sendEvent dans webhook/route.ts ──────────────────────────────────────

test("B2C-WALLET-EMAIL-01: sendEvent wallet/customer.credited présent dans webhook/route.ts", () => {
  assert.match(webhookSrc, /sendEvent\(["']wallet\/customer\.credited["']/)
})

// ─── 8. Conditionné sur b2cResult.status === "credited" ──────────────────────

test("B2C-WALLET-EMAIL-01: sendEvent conditionné sur b2cResult.status === credited", () => {
  assert.match(
    webhookSrc,
    /b2cResult\.status\s*===\s*["']credited["'][\s\S]{0,200}sendEvent\(["']wallet\/customer\.credited["']/,
  )
})

// ─── 9. fire-and-forget .catch() dans webhook/route.ts ───────────────────────

test("B2C-WALLET-EMAIL-01: sendEvent wallet/customer.credited est fire-and-forget (.catch)", () => {
  assert.match(
    webhookSrc,
    /sendEvent\(["']wallet\/customer\.credited["'][\s\S]{0,400}?\)\.catch\(/,
  )
})

// ─── 10. Lookup email depuis customers table dans le handler ─────────────────

test("B2C-WALLET-EMAIL-01: handler résout email depuis customers table (jamais payload direct)", () => {
  // Le handler importe customers depuis schema
  assert.match(handlerSrc, /from\s*["']@\/lib\/db\/schema["']/)
  assert.match(handlerSrc, /customers/)
  // email.customers résolu depuis DB (eq(customers.id, customerId))
  assert.match(handlerSrc, /eq\(customers\.id,\s*customerId\)/)
})

// ─── 11. processWalletCustomerCredited importée dans route.ts ─────────────────
// INNGEST-WALLET-CREDITED-WIRING-01 — vérifie que le gap de câblage est comblé

test("B2C-WALLET-EMAIL-01: processWalletCustomerCredited importée dans app/api/inngest/route.ts", () => {
  assert.match(routeSrc, /processWalletCustomerCredited/)
})

// ─── 12. processWalletCustomerCredited dans le tableau functions de route.ts ──

test("B2C-WALLET-EMAIL-01: processWalletCustomerCredited dans le tableau functions de route.ts", () => {
  const functionsBlockIdx = routeSrc.indexOf("functions: [")
  assert.match(
    routeSrc.slice(functionsBlockIdx),
    /processWalletCustomerCredited,/,
  )
})
