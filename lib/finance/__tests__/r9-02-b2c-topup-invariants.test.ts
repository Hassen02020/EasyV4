/**
 * R9-02-B2C-TOPUP — invariants statiques sur le chantier WALLET-TOPUP-01
 * (recharge wallet B2C client via Paymee).
 *
 * Invariants protégés :
 *  1. SERVER ACTION — submitCustomerTopUp est "use server"
 *  2. AMOUNT GUARD — validation min/max côté serveur
 *  3. creditCustomerWallet appelé avec source: "online_card" et idempotencyKey
 *  4. wallet_ledger append-only — pas de UPDATE walletLedger dans le webhook core
 *  5. Idempotence event-level via paymentEvents + onConflictDoNothing
 *  6. Vérification identité PSP (P0-B)
 *  7. Page /compte/wallet existe
 *  8. Clés i18n wallet présentes dans fr/en/ar
 *  9. Route webhook enchaîne B2C après B2B no_match
 * 10. Migration SQL 0132 existe
 * 11. Schema Drizzle contient customerTopupRequests
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
}

const actionSrc = read("lib/finance/b2c-topup-actions.ts")
const webhookCoreSrc = read("lib/payment/customer-topup-webhook-core.ts")
const webhookRouteSrc = read("app/api/payment/webhook/route.ts")
const schemaSrc = read("lib/db/schema.ts")
const frJson = read("messages/fr.json")
const enJson = read("messages/en.json")
const arJson = read("messages/ar.json")

// ─── 1. SERVER ACTION ─────────────────────────────────────────────────────────

test("R9-02 : submitCustomerTopUp est une 'use server' action", () => {
  assert.match(actionSrc, /^"use server"/m)
  assert.ok(actionSrc.includes("export async function submitCustomerTopUp"))
})

// ─── 2. AMOUNT GUARD ──────────────────────────────────────────────────────────

test("R9-02 : validation montant min/max côté serveur (10–5000 TND)", () => {
  assert.ok(actionSrc.includes("MIN_AMOUNT_TND = 10"))
  assert.ok(actionSrc.includes("MAX_AMOUNT_TND = 5000"))
  assert.match(actionSrc, /amountTnd < MIN_AMOUNT_TND/)
  assert.match(actionSrc, /amountTnd > MAX_AMOUNT_TND/)
})

// ─── 3. creditCustomerWallet ──────────────────────────────────────────────────

test("R9-02 : creditCustomerWallet appelé avec source: 'online_card' et idempotencyKey", () => {
  assert.ok(webhookCoreSrc.includes("creditCustomerWallet"))
  assert.match(webhookCoreSrc, /source:\s*["']online_card["']/)
  assert.match(webhookCoreSrc, /idempotencyKey:\s*pending\.id/)
})

// ─── 4. APPEND-ONLY ───────────────────────────────────────────────────────────

test("R9-02 : wallet_ledger append-only — aucun UPDATE walletLedger dans le webhook core", () => {
  // Vérifie qu'il n'y a pas de tx.update(walletLedger) dans le webhook core
  assert.ok(!webhookCoreSrc.match(/\.update\(walletLedger\)/))
  // Vérifie qu'il n'y a pas de UPDATE wallet_ledger en dehors des commentaires
  const codeOnly = webhookCoreSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "")
  assert.ok(
    !codeOnly.match(/wallet_ledger.*UPDATE/i),
    "wallet_ledger ne doit jamais être UPDATE dans le code",
  )
})

// ─── 5. IDEMPOTENCE EVENT-LEVEL ───────────────────────────────────────────────

test("R9-02 : idempotence event-level via paymentEvents + onConflictDoNothing", () => {
  assert.ok(webhookCoreSrc.includes("paymentEvents"))
  assert.ok(webhookCoreSrc.includes("onConflictDoNothing"))
  assert.ok(webhookCoreSrc.includes("pending.id"))
})

// ─── 6. PSP CHECK ─────────────────────────────────────────────────────────────

test("R9-02 : vérification identité PSP (P0-B) dans le webhook core", () => {
  assert.ok(webhookCoreSrc.includes("pending.psp !== provider"))
  assert.ok(webhookCoreSrc.includes("PSP_MISMATCH"))
})

// ─── 7. WALLET PAGE ───────────────────────────────────────────────────────────

test("R9-02 : la page /compte/wallet/page.tsx existe", () => {
  const pagePath = "app/(public)/[locale]/compte/wallet/page.tsx"
  assert.ok(existsSync(join(ROOT, pagePath)))
  const pageSrc = read(pagePath)
  // Formulaire carte rendu via le sélecteur de moyens
  // (WALLET-B2C-RECHARGE-METHODS-01).
  assert.ok(pageSrc.includes("WalletTopUpPanel"))
  assert.ok(
    read("components/compte/wallet-topup-panel.tsx").includes(
      "<WalletTopUpForm />",
    ),
  )
  assert.ok(pageSrc.includes("getCustomerWalletBalance"))
})

// ─── 8. I18N KEYS ─────────────────────────────────────────────────────────────

test("R9-02 : clés i18n wallet présentes dans fr.json", () => {
  for (const key of [
    "walletSectionTitle",
    "walletBalance",
    "walletTopUpButton",
    "walletSuccessTitle",
  ]) {
    assert.ok(frJson.includes(`"${key}"`), `clé manquante fr.json : ${key}`)
  }
})

test("R9-02 : clés i18n wallet présentes dans en.json", () => {
  for (const key of [
    "walletSectionTitle",
    "walletBalance",
    "walletTopUpButton",
    "walletSuccessTitle",
  ]) {
    assert.ok(enJson.includes(`"${key}"`), `clé manquante en.json : ${key}`)
  }
})

test("R9-02 : clés i18n wallet présentes dans ar.json", () => {
  for (const key of [
    "walletSectionTitle",
    "walletBalance",
    "walletTopUpButton",
    "walletSuccessTitle",
  ]) {
    assert.ok(arJson.includes(`"${key}"`), `clé manquante ar.json : ${key}`)
  }
})

// ─── 9. WEBHOOK CHAIN ─────────────────────────────────────────────────────────

test("R9-02 : la route webhook enchaîne B2C après B2B no_match", () => {
  assert.ok(webhookRouteSrc.includes("processCustomerTopupWebhookCore"))
  assert.ok(webhookRouteSrc.includes('result.status === "no_match"'))
  // Vérifie que l'appel (pas l'import) est bien dans le bloc no_match
  const noMatchIdx = webhookRouteSrc.indexOf('result.status === "no_match"')
  // La deuxième occurrence de processCustomerTopupWebhookCore est l'appel
  const firstOccIdx = webhookRouteSrc.indexOf("processCustomerTopupWebhookCore")
  const callIdx = webhookRouteSrc.indexOf(
    "processCustomerTopupWebhookCore",
    firstOccIdx + 1,
  )
  assert.ok(
    callIdx > noMatchIdx,
    "l'appel à processCustomerTopupWebhookCore doit être dans le bloc no_match",
  )
})

// ─── 10. MIGRATION SQL ────────────────────────────────────────────────────────

test("R9-02 : migration SQL 0132 existe avec les colonnes requises", () => {
  const migPath = "drizzle/manual/0132_customer_topup_requests.sql"
  assert.ok(existsSync(join(ROOT, migPath)))
  const sql = read(migPath)
  assert.ok(sql.includes("customer_topup_requests"))
  assert.ok(sql.includes("customer_id"))
  assert.ok(sql.includes("payment_reference"))
  assert.ok(sql.includes("idempotency_key"))
  assert.ok(sql.includes("ROW LEVEL SECURITY"))
})

// ─── 11. SCHEMA DRIZZLE ───────────────────────────────────────────────────────

test("R9-02 : Drizzle schema contient customerTopupRequests", () => {
  assert.ok(schemaSrc.includes("customerTopupRequests"))
  assert.ok(schemaSrc.includes("customer_topup_requests"))
  assert.ok(schemaSrc.includes("idempotencyKey"))
  assert.ok(schemaSrc.includes("paymentReference"))
})
