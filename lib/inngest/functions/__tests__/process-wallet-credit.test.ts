/**
 * INNGEST-HANDLER-WIRING-00/wallet — invariants statiques sur le handler
 * process-wallet-credit.ts.
 *
 * Invariants protégés :
 *
 * 1. Écoute l'événement "wallet/credited".
 *
 * 2. LABELS MÉTHODES — RECHARGE_METHOD_LABEL couvre les valeurs réelles émises
 *    par les 3 appelants :
 *    - enum recharge_method (cash/bank_transfer/postal_transfer/postal_mandate/
 *      check/card_international)
 *    - "ADMIN_DIRECT" (lib/admin/agencies-actions.ts)
 *    - "PSP_<PROVIDER>" — géré par le préfixe PSP_ (dynamique)
 *
 * 3. resolveWalletCreditMethodLabel exportée (appelée dans le template email).
 *
 * 4. processWalletCredit exporté depuis l'index barrel.
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const processSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/process-wallet-credit.ts"),
  "utf8",
)
const clientSrc = readFileSync(join(ROOT, "lib/inngest/client.ts"), "utf8")
const indexSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/index.ts"),
  "utf8",
)

// ─── Invariant 1 : écoute le bon événement ────────────────────────────────

test('INNGEST-HANDLER-WIRING-00/wallet : écoute "wallet/credited"', () => {
  assert.match(processSrc, /"wallet\/credited"/)
})

// ─── Invariant 2a : labels enum recharge_method ───────────────────────────

test("INNGEST-HANDLER-WIRING-00/wallet : label cash = espèces", () => {
  assert.match(processSrc, /cash:\s*"espèces"/)
})

test("INNGEST-HANDLER-WIRING-00/wallet : label bank_transfer = virement bancaire", () => {
  assert.match(processSrc, /bank_transfer:\s*"virement bancaire"/)
})

test("INNGEST-HANDLER-WIRING-00/wallet : label postal_transfer = virement postal", () => {
  assert.match(processSrc, /postal_transfer:\s*"virement postal"/)
})

test("INNGEST-HANDLER-WIRING-00/wallet : label postal_mandate = mandat postal", () => {
  assert.match(processSrc, /postal_mandate:\s*"mandat postal"/)
})

test("INNGEST-HANDLER-WIRING-00/wallet : label check = chèque", () => {
  assert.match(processSrc, /check:\s*"chèque"/)
})

test("INNGEST-HANDLER-WIRING-00/wallet : label card_international = carte internationale", () => {
  assert.match(processSrc, /card_international:\s*"carte internationale"/)
})

// ─── Invariant 2b : label ADMIN_DIRECT ────────────────────────────────────

test("INNGEST-HANDLER-WIRING-00/wallet : label ADMIN_DIRECT = crédit direct admin", () => {
  assert.match(processSrc, /ADMIN_DIRECT:\s*"crédit direct admin"/)
})

// ─── Invariant 2c : label PSP_ dynamique ──────────────────────────────────

test("INNGEST-HANDLER-WIRING-00/wallet : label PSP_ généré dynamiquement via startsWith", () => {
  assert.match(processSrc, /startsWith\(["']PSP_["']\)/)
})

// ─── Invariant 3 : export resolveWalletCreditMethodLabel ──────────────────

test("INNGEST-HANDLER-WIRING-00/wallet : resolveWalletCreditMethodLabel exportée", () => {
  assert.match(processSrc, /export function resolveWalletCreditMethodLabel/)
})

// ─── Invariant 4 : déclaration dans client.ts ─────────────────────────────

test('INNGEST-HANDLER-WIRING-00/wallet : client.ts déclare "wallet/credited"', () => {
  assert.match(clientSrc, /"wallet\/credited"/)
})

// ─── Invariant 5 : export barrel ──────────────────────────────────────────

test("INNGEST-HANDLER-WIRING-00/wallet : index.ts exporte processWalletCredit", () => {
  assert.match(indexSrc, /processWalletCredit.*from.*process-wallet-credit/)
})
