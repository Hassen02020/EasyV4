/**
 * ACTIVITY-B2B-DRIFT-01 — invariants statiques sur la garde anti-drift de
 * prix (CART-DRIFT-01) pour le chemin de réservation Attraction B2B.
 *
 * Invariants protégés :
 *
 * 1. expectedTotalTnd présent dans activityPartnerBookingSchema (schemas.ts).
 * 2. priceDrifted importé dans booking-actions.ts.
 * 3. Garde priceDrifted exécutée dans createActivityBooking (booking-actions.ts).
 * 4. Garde positionnée AVANT le débit wallet (debitPartnerCredit).
 * 5. Code PRICE_CHANGED dans la map d'erreurs.
 * 6. vatRatePct présent dans le type BookableOption (session kind,
 *    product-booking-options-actions.ts).
 * 7. getActiveFiscalRuleInTx importé dans product-booking-options-actions.ts.
 * 8. vatRatePct calculé depuis la règle fiscale (pas de constante codée en dur).
 * 9. expectedTotalTnd transmis depuis authorized-products-list.tsx vers
 *    createActivityBooking.
 * 10. computePriceBreakdown importé dans authorized-products-list.tsx (même
 *     formule que le serveur).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const schemasSrc = readFileSync(join(ROOT, "lib/activities/schemas.ts"), "utf8")
const bookingSrc = readFileSync(
  join(ROOT, "lib/activities/booking-actions.ts"),
  "utf8",
)
const optionsSrc = readFileSync(
  join(ROOT, "lib/b2b/product-booking-options-actions.ts"),
  "utf8",
)
const componentSrc = readFileSync(
  join(ROOT, "components/pro/authorized-products-list.tsx"),
  "utf8",
)

// ─── 1. Schéma B2B — champ expectedTotalTnd ──────────────────────────────────

test("ACTIVITY-B2B-DRIFT-01: expectedTotalTnd présent dans activityPartnerBookingSchema", () => {
  const schemaBlockIdx = schemasSrc.indexOf("activityPartnerBookingSchema")
  assert.match(
    schemasSrc.slice(schemaBlockIdx, schemaBlockIdx + 1200),
    /expectedTotalTnd/,
  )
})

// ─── 2. Import de priceDrifted dans booking-actions.ts ───────────────────────

test("ACTIVITY-B2B-DRIFT-01: priceDrifted importé depuis @/lib/booking/pricing", () => {
  assert.match(bookingSrc, /priceDrifted/)
  assert.match(bookingSrc, /from.*@\/lib\/booking\/pricing/)
})

// ─── 3. Garde priceDrifted dans createActivityBooking ────────────────────────

test("ACTIVITY-B2B-DRIFT-01: priceDrifted(booking.expectedTotalTnd, totalTnd) présent", () => {
  assert.match(
    bookingSrc,
    /priceDrifted\(booking\.expectedTotalTnd,\s*totalTnd\)/,
  )
})

// ─── 4. Garde AVANT le débit wallet ──────────────────────────────────────────

test("ACTIVITY-B2B-DRIFT-01: garde priceDrifted positionnée avant debitPartnerCredit", () => {
  const driftIdx = bookingSrc.indexOf("priceDrifted(booking.expectedTotalTnd")
  const debitIdx = bookingSrc.indexOf("debitPartnerCredit(")
  assert.ok(driftIdx !== -1, "priceDrifted non trouvé")
  assert.ok(debitIdx !== -1, "debitPartnerCredit non trouvé")
  assert.ok(driftIdx < debitIdx, "garde drift DOIT précéder debitPartnerCredit")
})

// ─── 5. Code PRICE_CHANGED dans la map d'erreurs ─────────────────────────────

test("ACTIVITY-B2B-DRIFT-01: code PRICE_CHANGED dans la map d'erreurs de booking-actions.ts", () => {
  assert.match(bookingSrc, /PRICE_CHANGED/)
})

// ─── 6. vatRatePct dans BookableOption (session kind) ────────────────────────

test("ACTIVITY-B2B-DRIFT-01: vatRatePct présent dans le type BookableOption (session)", () => {
  const sessionBlockIdx = optionsSrc.indexOf("kind: \"session\"")
  assert.ok(sessionBlockIdx !== -1, "bloc session non trouvé dans BookableOption")
  assert.match(optionsSrc.slice(sessionBlockIdx, sessionBlockIdx + 800), /vatRatePct/)
})

// ─── 7. getActiveFiscalRuleInTx importé dans product-booking-options-actions ─

test("ACTIVITY-B2B-DRIFT-01: getActiveFiscalRuleInTx importé dans product-booking-options-actions.ts", () => {
  assert.match(optionsSrc, /getActiveFiscalRuleInTx/)
  assert.match(optionsSrc, /from.*@\/lib\/finance\/fiscal-rules/)
})

// ─── 8. vatRatePct résolu depuis fiscalRule (pas une constante codée en dur) ─

test("ACTIVITY-B2B-DRIFT-01: vatRatePct calculé depuis fiscalRule (parseFloat(fiscalRule.vatRate))", () => {
  assert.match(
    optionsSrc,
    /vatRatePct.*fiscalRule.*vatRate|fiscalRule.*vatRate.*vatRatePct/,
  )
})

// ─── 9. expectedTotalTnd transmis vers createActivityBooking ─────────────────

test("ACTIVITY-B2B-DRIFT-01: expectedTotalTnd transmis dans l'appel createActivityBooking du composant", () => {
  const callIdx = componentSrc.indexOf("createActivityBooking(")
  assert.ok(callIdx !== -1, "createActivityBooking non trouvé dans le composant")
  assert.match(
    componentSrc.slice(callIdx, callIdx + 400),
    /expectedTotalTnd/,
  )
})

// ─── 10. computePriceBreakdown importé dans authorized-products-list.tsx ─────

test("ACTIVITY-B2B-DRIFT-01: computePriceBreakdown importé depuis @/lib/booking/pricing dans le composant", () => {
  assert.match(componentSrc, /computePriceBreakdown/)
  assert.match(componentSrc, /from.*@\/lib\/booking\/pricing/)
})
