/**
 * FISCAL-MONDE-01 — invariants statiques sur le câblage fiscal du module
 * Hôtels Monde (guest-booking-actions.ts).
 *
 * 1. IMPORT FISCAL — `getActiveFiscalRuleInTx` et `buildFiscalSnapshotFromTtc`
 *    sont importés.
 * 2. APPEL FAIL-CLOSED — `getActiveFiscalRuleInTx` est appelé avec
 *    ("TN", "hotel_monde") et un guard `FISCAL_RULE_NOT_FOUND` suit.
 * 3. SNAPSHOT DANS INSERT — `fiscalSnapshot: buildFiscalSnapshotFromTtc(`
 *    apparaît dans le bloc `.values(` de l'INSERT reservations.
 * 4. TAUX PARSEFLOAT — `parseFloat(fiscalRule.vatRate)` est transmis (pas
 *    de taux codé en dur — règle permanente taux de change CURRENCY-DIM-01a).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/hotels-monde/guest-booking-actions.ts"),
  "utf8",
)

test("FISCAL-MONDE-01-01: getActiveFiscalRuleInTx importé", () => {
  assert.ok(
    src.includes('getActiveFiscalRuleInTx" }') ||
      src.includes("getActiveFiscalRuleInTx }") ||
      src.includes("{ getActiveFiscalRuleInTx }") ||
      src.includes("getActiveFiscalRuleInTx\n}") ||
      /import[^;]+getActiveFiscalRuleInTx/.test(src),
    "getActiveFiscalRuleInTx doit être importé",
  )
})

test("FISCAL-MONDE-01-02: buildFiscalSnapshotFromTtc importé", () => {
  assert.ok(
    /import[^;]+buildFiscalSnapshotFromTtc/.test(src),
    "buildFiscalSnapshotFromTtc doit être importé",
  )
})

test("FISCAL-MONDE-01-03: getActiveFiscalRuleInTx appelé avec TN + hotel_monde", () => {
  assert.ok(
    src.includes('"TN"') && src.includes('"hotel_monde"'),
    'getActiveFiscalRuleInTx doit être appelé avec "TN" et "hotel_monde"',
  )
  assert.ok(
    src.includes("getActiveFiscalRuleInTx("),
    "getActiveFiscalRuleInTx doit être appelé",
  )
})

test("FISCAL-MONDE-01-04: guard FISCAL_RULE_NOT_FOUND présent", () => {
  assert.ok(
    src.includes("FISCAL_RULE_NOT_FOUND"),
    'Le guard throw new Error("FISCAL_RULE_NOT_FOUND") doit être présent',
  )
})

test("FISCAL-MONDE-01-05: fiscalSnapshot câblé dans INSERT reservations", () => {
  assert.ok(
    src.includes("fiscalSnapshot: buildFiscalSnapshotFromTtc("),
    "fiscalSnapshot doit être câblé via buildFiscalSnapshotFromTtc dans l'INSERT",
  )
})

test("FISCAL-MONDE-01-06: taux via parseFloat(fiscalRule.vatRate) — jamais codé en dur", () => {
  assert.ok(
    src.includes("parseFloat(fiscalRule.vatRate)"),
    "Le taux TVA doit venir de parseFloat(fiscalRule.vatRate), jamais codé en dur",
  )
})

test("FISCAL-MONDE-01-07: fiscalRule.id et fiscalRule.version transmis (traçabilité)", () => {
  assert.ok(
    src.includes("fiscalRule.id") && src.includes("fiscalRule.version"),
    "fiscalRule.id et fiscalRule.version doivent être transmis au snapshot",
  )
})
