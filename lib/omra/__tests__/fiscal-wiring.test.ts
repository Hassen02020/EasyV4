/**
 * FISCAL-OMRA-01 — invariants statiques sur le câblage fiscal du module Omra.
 *
 * Deux chemins vérifiés :
 *   — B2B : lib/omra/booking-actions.ts (remplace buildPendingFiscalSnapshot
 *     hardcodé par getActiveFiscalRuleInTx + buildFiscalSnapshotFromTtc)
 *   — B2C : lib/omra/guest-booking-actions.ts (ajout fiscalSnapshot NULL→engine)
 *
 * Invariants par chemin :
 *   1. Import getActiveFiscalRuleInTx
 *   2. Import buildFiscalSnapshotFromTtc
 *   3. Appel avec "TN" + "omra"
 *   4. Guard FISCAL_RULE_NOT_FOUND
 *   5. fiscalSnapshot câblé via buildFiscalSnapshotFromTtc dans l'INSERT
 *   6. parseFloat(fiscalRule.vatRate) — taux jamais codé en dur
 *   7. fiscalRule.id + fiscalRule.version (traçabilité)
 *   8. buildPendingFiscalSnapshot absent (B2B : plus de hardcode)
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const b2b = readFileSync(join(ROOT, "lib/omra/booking-actions.ts"), "utf8")
const b2c = readFileSync(
  join(ROOT, "lib/omra/guest-booking-actions.ts"),
  "utf8",
)

// --- B2B (booking-actions.ts) ---

test("FISCAL-OMRA-01-B2B-01: getActiveFiscalRuleInTx importé (B2B)", () => {
  assert.ok(
    /import[^;]+getActiveFiscalRuleInTx/.test(b2b),
    "getActiveFiscalRuleInTx doit être importé dans booking-actions.ts",
  )
})

test("FISCAL-OMRA-01-B2B-02: buildFiscalSnapshotFromTtc importé (B2B)", () => {
  assert.ok(
    /import[^;]+buildFiscalSnapshotFromTtc/.test(b2b),
    "buildFiscalSnapshotFromTtc doit être importé dans booking-actions.ts",
  )
})

test("FISCAL-OMRA-01-B2B-03: appel avec TN + omra (B2B)", () => {
  assert.ok(
    b2b.includes('"TN"') && b2b.includes('"omra"'),
    'getActiveFiscalRuleInTx doit être appelé avec "TN" et "omra"',
  )
  assert.ok(
    b2b.includes("getActiveFiscalRuleInTx("),
    "getActiveFiscalRuleInTx doit être appelé",
  )
})

test("FISCAL-OMRA-01-B2B-04: guard FISCAL_RULE_NOT_FOUND (B2B)", () => {
  assert.ok(
    b2b.includes("FISCAL_RULE_NOT_FOUND"),
    'throw new Error("FISCAL_RULE_NOT_FOUND") doit être présent dans booking-actions.ts',
  )
})

test("FISCAL-OMRA-01-B2B-05: fiscalSnapshot câblé via buildFiscalSnapshotFromTtc (B2B)", () => {
  assert.ok(
    b2b.includes("fiscalSnapshot: buildFiscalSnapshotFromTtc("),
    "fiscalSnapshot doit être câblé via buildFiscalSnapshotFromTtc dans l'INSERT (B2B)",
  )
})

test("FISCAL-OMRA-01-B2B-06: taux via parseFloat(fiscalRule.vatRate) — jamais codé en dur (B2B)", () => {
  assert.ok(
    b2b.includes("parseFloat(fiscalRule.vatRate)"),
    "Le taux TVA doit venir de parseFloat(fiscalRule.vatRate) dans booking-actions.ts",
  )
})

test("FISCAL-OMRA-01-B2B-07: fiscalRule.id + fiscalRule.version présents (B2B)", () => {
  assert.ok(
    b2b.includes("fiscalRule.id") && b2b.includes("fiscalRule.version"),
    "fiscalRule.id et fiscalRule.version doivent être transmis (traçabilité) dans booking-actions.ts",
  )
})

test("FISCAL-OMRA-01-B2B-08: buildPendingFiscalSnapshot absent (B2B — hardcode supprimé)", () => {
  assert.ok(
    !b2b.includes("buildPendingFiscalSnapshot"),
    "buildPendingFiscalSnapshot ne doit plus apparaître dans booking-actions.ts",
  )
})

// --- B2C (guest-booking-actions.ts) ---

test("FISCAL-OMRA-01-B2C-01: getActiveFiscalRuleInTx importé (B2C)", () => {
  assert.ok(
    /import[^;]+getActiveFiscalRuleInTx/.test(b2c),
    "getActiveFiscalRuleInTx doit être importé dans guest-booking-actions.ts",
  )
})

test("FISCAL-OMRA-01-B2C-02: buildFiscalSnapshotFromTtc importé (B2C)", () => {
  assert.ok(
    /import[^;]+buildFiscalSnapshotFromTtc/.test(b2c),
    "buildFiscalSnapshotFromTtc doit être importé dans guest-booking-actions.ts",
  )
})

test("FISCAL-OMRA-01-B2C-03: appel avec TN + omra (B2C)", () => {
  assert.ok(
    b2c.includes('"TN"') && b2c.includes('"omra"'),
    'getActiveFiscalRuleInTx doit être appelé avec "TN" et "omra"',
  )
  assert.ok(
    b2c.includes("getActiveFiscalRuleInTx("),
    "getActiveFiscalRuleInTx doit être appelé dans guest-booking-actions.ts",
  )
})

test("FISCAL-OMRA-01-B2C-04: guard FISCAL_RULE_NOT_FOUND (B2C)", () => {
  assert.ok(
    b2c.includes("FISCAL_RULE_NOT_FOUND"),
    'throw new Error("FISCAL_RULE_NOT_FOUND") doit être présent dans guest-booking-actions.ts',
  )
})

test("FISCAL-OMRA-01-B2C-05: fiscalSnapshot câblé via buildFiscalSnapshotFromTtc (B2C)", () => {
  assert.ok(
    b2c.includes("fiscalSnapshot: buildFiscalSnapshotFromTtc("),
    "fiscalSnapshot doit être câblé via buildFiscalSnapshotFromTtc dans l'INSERT (B2C)",
  )
})

test("FISCAL-OMRA-01-B2C-06: taux via parseFloat(fiscalRule.vatRate) — jamais codé en dur (B2C)", () => {
  assert.ok(
    b2c.includes("parseFloat(fiscalRule.vatRate)"),
    "Le taux TVA doit venir de parseFloat(fiscalRule.vatRate) dans guest-booking-actions.ts",
  )
})

test("FISCAL-OMRA-01-B2C-07: fiscalRule.id + fiscalRule.version présents (B2C)", () => {
  assert.ok(
    b2c.includes("fiscalRule.id") && b2c.includes("fiscalRule.version"),
    "fiscalRule.id et fiscalRule.version doivent être transmis (traçabilité) dans guest-booking-actions.ts",
  )
})
