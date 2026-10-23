/**
 * PRICING-VATRULE-01 — invariants statiques sur le câblage vatRate dynamique.
 *
 * Vérifie que CHAQUE call-site de computePriceBreakdown (7 au total sur 5
 * fichiers) reçoit son vatRate depuis la règle fiscale active (DB) et non
 * depuis la valeur par défaut hardcodée 19 de RatePayload.
 *
 * Call-sites couverts :
 *   #1 Hotel B2B  — lib/booking/actions.ts
 *   #2 Hotel B2C  — lib/booking/guest-actions.ts (breakdownBeforePromo)
 *   #3 Hotel B2C  — lib/booking/guest-actions.ts (breakdown promo)
 *   #4 Package B2C — lib/packages/booking-actions.ts
 *   #5 Package B2B — lib/packages/booking-actions.ts
 *   #6 Activity B2B — lib/activities/booking-actions.ts
 *   #7 Activity B2C — lib/activities/guest-booking-actions.ts
 *
 * Invariants par call-site :
 *   a. Import de la fonction de résolution fiscale appropriée
 *   b. Module string correct ("hotel" / "package" / "activity")
 *   c. Guard FISCAL_RULE_NOT_FOUND présent
 *   d. vatRate passé via parseFloat(fiscalRule*.vatRate)
 *   e. Ordre : fetch fiscal rule AVANT computePriceBreakdown (dans le source)
 *   f. Pas de vatRate: 19 codé en dur dans le fichier
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const hotelB2B = readFileSync(join(ROOT, "lib/booking/actions.ts"), "utf8")
const hotelB2C = readFileSync(
  join(ROOT, "lib/booking/guest-actions.ts"),
  "utf8",
)
const packages = readFileSync(
  join(ROOT, "lib/packages/booking-actions.ts"),
  "utf8",
)
const activityB2B = readFileSync(
  join(ROOT, "lib/activities/booking-actions.ts"),
  "utf8",
)
const activityB2C = readFileSync(
  join(ROOT, "lib/activities/guest-booking-actions.ts"),
  "utf8",
)

// ═══════════════════════════════════════════════════════════════════
// Call-site #1 — Hotel B2B (lib/booking/actions.ts)
// Stratégie : getActiveFiscalRule (non-TX) avant computePriceBreakdown,
// getActiveFiscalRuleInTx (TX) conservé pour le snapshot dans la TX.
// ═══════════════════════════════════════════════════════════════════

test("PRICING-VATRULE-01-HOTEL-B2B-a: getActiveFiscalRule importé", () => {
  assert.ok(
    /import[^;]+getActiveFiscalRule[^I]/.test(hotelB2B) ||
      hotelB2B.includes("getActiveFiscalRule,") ||
      hotelB2B.includes("{ getActiveFiscalRule"),
    "getActiveFiscalRule (non-TX) doit être importé dans lib/booking/actions.ts",
  )
})

test("PRICING-VATRULE-01-HOTEL-B2B-b: module 'hotel' dans l'appel fiscal", () => {
  assert.ok(
    hotelB2B.includes('"hotel"'),
    'getActiveFiscalRule doit être appelé avec "hotel" dans lib/booking/actions.ts',
  )
})

test("PRICING-VATRULE-01-HOTEL-B2B-c: guard FISCAL_RULE_NOT_FOUND présent", () => {
  assert.ok(
    hotelB2B.includes("FISCAL_RULE_NOT_FOUND"),
    'throw new Error("FISCAL_RULE_NOT_FOUND") doit être présent dans lib/booking/actions.ts',
  )
})

test("PRICING-VATRULE-01-HOTEL-B2B-d: vatRate via parseFloat — jamais codé en dur", () => {
  assert.ok(
    hotelB2B.includes("vatRate: parseFloat("),
    "vatRate doit venir de parseFloat(fiscalRuleForBreakdown.vatRate) dans lib/booking/actions.ts",
  )
})

test("PRICING-VATRULE-01-HOTEL-B2B-e: fetch fiscal rule AVANT computePriceBreakdown", () => {
  const fetchPos = hotelB2B.indexOf("getActiveFiscalRule(")
  const breakdownPos = hotelB2B.indexOf("computePriceBreakdown(")
  assert.ok(fetchPos > -1, "getActiveFiscalRule doit être appelé")
  assert.ok(breakdownPos > -1, "computePriceBreakdown doit être appelé")
  assert.ok(
    fetchPos < breakdownPos,
    "getActiveFiscalRule doit précéder computePriceBreakdown dans le source",
  )
})

test("PRICING-VATRULE-01-HOTEL-B2B-f: pas de vatRate: 19 codé en dur", () => {
  assert.ok(
    !hotelB2B.includes("vatRate: 19"),
    "vatRate: 19 ne doit pas être codé en dur dans lib/booking/actions.ts",
  )
})

// ═══════════════════════════════════════════════════════════════════
// Call-sites #2 et #3 — Hotel B2C (lib/booking/guest-actions.ts)
// Deux appels à computePriceBreakdown (breakdownBeforePromo + promo),
// un seul fetch de la règle fiscale (avant le premier appel).
// ═══════════════════════════════════════════════════════════════════

test("PRICING-VATRULE-01-HOTEL-B2C-a: getActiveFiscalRule importé", () => {
  assert.ok(
    hotelB2C.includes("getActiveFiscalRule,") ||
      hotelB2C.includes("getActiveFiscalRule }") ||
      hotelB2C.includes("{ getActiveFiscalRule") ||
      /import[^;]+getActiveFiscalRule[^I]/.test(hotelB2C),
    "getActiveFiscalRule (non-TX) doit être importé dans lib/booking/guest-actions.ts",
  )
})

test("PRICING-VATRULE-01-HOTEL-B2C-b: module 'hotel' dans l'appel fiscal", () => {
  assert.ok(
    hotelB2C.includes('"hotel"'),
    'getActiveFiscalRule doit être appelé avec "hotel" dans lib/booking/guest-actions.ts',
  )
})

test("PRICING-VATRULE-01-HOTEL-B2C-c: guard FISCAL_RULE_NOT_FOUND présent", () => {
  assert.ok(
    hotelB2C.includes("FISCAL_RULE_NOT_FOUND"),
    'throw new Error("FISCAL_RULE_NOT_FOUND") doit être présent dans lib/booking/guest-actions.ts',
  )
})

test("PRICING-VATRULE-01-HOTEL-B2C-d: vatRate via parseFloat (les deux appels)", () => {
  // vatRate: parseFloat(fiscalRuleForBreakdown.vatRate) doit apparaître au moins 2 fois
  const matches = hotelB2C.match(/vatRate:\s*parseFloat\(/g)
  assert.ok(
    matches && matches.length >= 2,
    "vatRate: parseFloat( doit apparaître au moins 2 fois (breakdownBeforePromo + breakdown promo) dans guest-actions.ts",
  )
})

test("PRICING-VATRULE-01-HOTEL-B2C-e: fetch fiscal rule AVANT computePriceBreakdown", () => {
  const fetchPos = hotelB2C.indexOf("getActiveFiscalRule(")
  const breakdownPos = hotelB2C.indexOf("computePriceBreakdown(")
  assert.ok(fetchPos > -1, "getActiveFiscalRule doit être appelé")
  assert.ok(breakdownPos > -1, "computePriceBreakdown doit être appelé")
  assert.ok(
    fetchPos < breakdownPos,
    "getActiveFiscalRule doit précéder le premier computePriceBreakdown dans guest-actions.ts",
  )
})

test("PRICING-VATRULE-01-HOTEL-B2C-f: pas de vatRate: 19 codé en dur", () => {
  assert.ok(
    !hotelB2C.includes("vatRate: 19"),
    "vatRate: 19 ne doit pas être codé en dur dans lib/booking/guest-actions.ts",
  )
})

// ═══════════════════════════════════════════════════════════════════
// Call-sites #4 et #5 — Packages B2C + B2B (lib/packages/booking-actions.ts)
// Deux call-sites dans le même fichier, chacun avec son propre fetch InTx
// (fiscalRule pour B2C, fiscalRuleB2B pour B2B).
// ═══════════════════════════════════════════════════════════════════

test("PRICING-VATRULE-01-PKG-a: getActiveFiscalRuleInTx importé", () => {
  assert.ok(
    /import[^;]+getActiveFiscalRuleInTx/.test(packages),
    "getActiveFiscalRuleInTx doit être importé dans lib/packages/booking-actions.ts",
  )
})

test("PRICING-VATRULE-01-PKG-b: module 'package' dans les appels fiscaux", () => {
  assert.ok(
    packages.includes('"package"'),
    'getActiveFiscalRuleInTx doit être appelé avec "package" dans lib/packages/booking-actions.ts',
  )
})

test("PRICING-VATRULE-01-PKG-c: guards FISCAL_RULE_NOT_FOUND présents (B2C + B2B)", () => {
  const matches = packages.match(/FISCAL_RULE_NOT_FOUND/g)
  assert.ok(
    matches && matches.length >= 2,
    "FISCAL_RULE_NOT_FOUND doit apparaître au moins 2 fois (B2C et B2B) dans lib/packages/booking-actions.ts",
  )
})

test("PRICING-VATRULE-01-PKG-d: vatRate via parseFloat pour B2C et B2B", () => {
  assert.ok(
    packages.includes("parseFloat(fiscalRule.vatRate)"),
    "parseFloat(fiscalRule.vatRate) doit être présent (B2C) dans lib/packages/booking-actions.ts",
  )
  assert.ok(
    packages.includes("parseFloat(fiscalRuleB2B.vatRate)"),
    "parseFloat(fiscalRuleB2B.vatRate) doit être présent (B2B) dans lib/packages/booking-actions.ts",
  )
})

test("PRICING-VATRULE-01-PKG-e: fetch fiscal rule InTx AVANT computePriceBreakdown", () => {
  const fetchPos = packages.indexOf("getActiveFiscalRuleInTx(")
  const breakdownPos = packages.indexOf("computePriceBreakdown(")
  assert.ok(fetchPos > -1, "getActiveFiscalRuleInTx doit être appelé")
  assert.ok(breakdownPos > -1, "computePriceBreakdown doit être appelé")
  assert.ok(
    fetchPos < breakdownPos,
    "getActiveFiscalRuleInTx doit précéder le premier computePriceBreakdown dans booking-actions.ts (packages)",
  )
})

test("PRICING-VATRULE-01-PKG-f: pas de vatRate: 19 codé en dur", () => {
  assert.ok(
    !packages.includes("vatRate: 19"),
    "vatRate: 19 ne doit pas être codé en dur dans lib/packages/booking-actions.ts",
  )
})

// ═══════════════════════════════════════════════════════════════════
// Call-site #6 — Activity B2B (lib/activities/booking-actions.ts)
// ═══════════════════════════════════════════════════════════════════

test("PRICING-VATRULE-01-ACT-B2B-a: getActiveFiscalRuleInTx importé", () => {
  assert.ok(
    /import[^;]+getActiveFiscalRuleInTx/.test(activityB2B),
    "getActiveFiscalRuleInTx doit être importé dans lib/activities/booking-actions.ts",
  )
})

test("PRICING-VATRULE-01-ACT-B2B-b: module 'activity' dans l'appel fiscal", () => {
  assert.ok(
    activityB2B.includes('"activity"'),
    'getActiveFiscalRuleInTx doit être appelé avec "activity" dans lib/activities/booking-actions.ts',
  )
})

test("PRICING-VATRULE-01-ACT-B2B-c: guard FISCAL_RULE_NOT_FOUND présent", () => {
  assert.ok(
    activityB2B.includes("FISCAL_RULE_NOT_FOUND"),
    'throw new Error("FISCAL_RULE_NOT_FOUND") doit être présent dans lib/activities/booking-actions.ts',
  )
})

test("PRICING-VATRULE-01-ACT-B2B-d: vatRate via parseFloat — jamais codé en dur", () => {
  assert.ok(
    activityB2B.includes("parseFloat(fiscalRule.vatRate)"),
    "vatRate doit venir de parseFloat(fiscalRule.vatRate) dans lib/activities/booking-actions.ts",
  )
})

test("PRICING-VATRULE-01-ACT-B2B-e: fetch fiscal rule InTx AVANT computePriceBreakdown", () => {
  const fetchPos = activityB2B.indexOf("getActiveFiscalRuleInTx(")
  const breakdownPos = activityB2B.indexOf("computePriceBreakdown(")
  assert.ok(fetchPos > -1, "getActiveFiscalRuleInTx doit être appelé")
  assert.ok(breakdownPos > -1, "computePriceBreakdown doit être appelé")
  assert.ok(
    fetchPos < breakdownPos,
    "getActiveFiscalRuleInTx doit précéder computePriceBreakdown dans lib/activities/booking-actions.ts",
  )
})

test("PRICING-VATRULE-01-ACT-B2B-f: pas de vatRate: 19 codé en dur", () => {
  assert.ok(
    !activityB2B.includes("vatRate: 19"),
    "vatRate: 19 ne doit pas être codé en dur dans lib/activities/booking-actions.ts",
  )
})

// ═══════════════════════════════════════════════════════════════════
// Call-site #7 — Activity B2C (lib/activities/guest-booking-actions.ts)
// ═══════════════════════════════════════════════════════════════════

test("PRICING-VATRULE-01-ACT-B2C-a: getActiveFiscalRuleInTx importé", () => {
  assert.ok(
    /import[^;]+getActiveFiscalRuleInTx/.test(activityB2C),
    "getActiveFiscalRuleInTx doit être importé dans lib/activities/guest-booking-actions.ts",
  )
})

test("PRICING-VATRULE-01-ACT-B2C-b: module 'activity' dans l'appel fiscal", () => {
  assert.ok(
    activityB2C.includes('"activity"'),
    'getActiveFiscalRuleInTx doit être appelé avec "activity" dans lib/activities/guest-booking-actions.ts',
  )
})

test("PRICING-VATRULE-01-ACT-B2C-c: guard FISCAL_RULE_NOT_FOUND présent", () => {
  assert.ok(
    activityB2C.includes("FISCAL_RULE_NOT_FOUND"),
    'throw new Error("FISCAL_RULE_NOT_FOUND") doit être présent dans lib/activities/guest-booking-actions.ts',
  )
})

test("PRICING-VATRULE-01-ACT-B2C-d: vatRate via parseFloat — jamais codé en dur", () => {
  assert.ok(
    activityB2C.includes("parseFloat(fiscalRule.vatRate)"),
    "vatRate doit venir de parseFloat(fiscalRule.vatRate) dans lib/activities/guest-booking-actions.ts",
  )
})

test("PRICING-VATRULE-01-ACT-B2C-e: fetch fiscal rule InTx AVANT computePriceBreakdown", () => {
  const fetchPos = activityB2C.indexOf("getActiveFiscalRuleInTx(")
  const breakdownPos = activityB2C.indexOf("computePriceBreakdown(")
  assert.ok(fetchPos > -1, "getActiveFiscalRuleInTx doit être appelé")
  assert.ok(breakdownPos > -1, "computePriceBreakdown doit être appelé")
  assert.ok(
    fetchPos < breakdownPos,
    "getActiveFiscalRuleInTx doit précéder computePriceBreakdown dans lib/activities/guest-booking-actions.ts",
  )
})

test("PRICING-VATRULE-01-ACT-B2C-f: pas de vatRate: 19 codé en dur", () => {
  assert.ok(
    !activityB2C.includes("vatRate: 19"),
    "vatRate: 19 ne doit pas être codé en dur dans lib/activities/guest-booking-actions.ts",
  )
})
