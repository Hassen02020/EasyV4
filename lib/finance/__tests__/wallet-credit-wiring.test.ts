/**
 * WALLET-CREDIT-WIRING-01 — invariants statiques sur
 * lib/finance/wallet-credit.ts (creditRechargeRequest + reverseRechargeCredit).
 *
 * Invariants protégés :
 *
 * 1. FOR UPDATE sur agencies — le solde agence est relu et verrouillé
 *    (`FOR UPDATE`) avant toute mise à jour (anti double-crédit concurrent
 *    même si l'appelant a déjà verrouillé wallet_recharge_requests).
 *
 * 2. set_agency_deposit_balance() via SQL raw — le solde agence est TOUJOURS
 *    mis à jour via cette fonction DB, JAMAIS via tx.update(agencies) direct
 *    (même canal que debitPartnerCredit, défense en profondeur).
 *
 * 3. Append-only partnerCreditMovements — tx.insert(partnerCreditMovements)
 *    pour chaque crédit ET chaque reverse — jamais tx.update sur cette table.
 *
 * 4. movementType="credit" pour creditRechargeRequest — un crédit de
 *    recharge ne peut jamais être enregistré comme "debit".
 *
 * 5. movementType="debit" pour reverseRechargeCredit — un remboursement PSP
 *    retire des fonds (type "debit"), jamais un "credit".
 *
 * 6. status="validated" après creditRechargeRequest — la demande est
 *    marquée "validated" dans la même transaction.
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(join(ROOT, "lib/finance/wallet-credit.ts"), "utf8")

// ─── Invariant 1 : FOR UPDATE sur agencies ────────────────────────────────────

test("WALLET-CREDIT-WIRING-01 : FOR UPDATE sur agencies avant mise à jour solde (anti double-crédit concurrent)", () => {
  assert.match(src, /agencies[\s\S]{0,100}\.for\s*\(\s*["']update["']\s*\)/)
})

test("WALLET-CREDIT-WIRING-01 : FOR UPDATE dans creditRechargeRequest ET reverseRechargeCredit (deux chemins)", () => {
  const occurrences = src.match(/\.for\s*\(\s*["']update["']\s*\)/g)
  assert.ok(
    occurrences !== null && occurrences.length >= 2,
    "FOR UPDATE doit apparaître au moins 2 fois (credit + reverse)",
  )
})

// ─── Invariant 2 : set_agency_deposit_balance via SQL raw ────────────────────

test("WALLET-CREDIT-WIRING-01 : set_agency_deposit_balance() via SQL — jamais tx.update(agencies)", () => {
  assert.match(src, /set_agency_deposit_balance\s*\(/)
  assert.doesNotMatch(src, /tx\.update\s*\(\s*agencies\s*\)/)
})

// ─── Invariant 3 : append-only partnerCreditMovements ────────────────────────

test("WALLET-CREDIT-WIRING-01 : .insert(partnerCreditMovements) — append-only, jamais UPDATE", () => {
  // Drizzle chaîne sur plusieurs lignes : tx\n    .insert(partnerCreditMovements)
  assert.match(src, /\.insert\s*\(\s*partnerCreditMovements\s*\)/)
  assert.doesNotMatch(src, /\.update\s*\(\s*partnerCreditMovements\s*\)/)
})

// ─── Invariant 4 : movementType="credit" pour creditRechargeRequest ──────────

test('WALLET-CREDIT-WIRING-01 : movementType: "credit" dans creditRechargeRequest', () => {
  assert.match(src, /movementType:\s*["']credit["']/)
})

// ─── Invariant 5 : movementType="debit" pour reverseRechargeCredit ───────────

test('WALLET-CREDIT-WIRING-01 : movementType: "debit" dans reverseRechargeCredit (remboursement PSP retire des fonds)', () => {
  assert.match(src, /movementType:\s*["']debit["']/)
})

// ─── Invariant 6 : status="validated" après credit ───────────────────────────

test('WALLET-CREDIT-WIRING-01 : status: "validated" dans creditRechargeRequest (demande marquée validée même transaction)', () => {
  assert.match(src, /status:\s*["']validated["']/)
})
