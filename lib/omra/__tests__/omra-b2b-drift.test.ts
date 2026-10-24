/**
 * OMRA-B2B-DRIFT-01 — invariants statiques sur la garde anti-drift de
 * prix (CART-DRIFT-01) pour le chemin de réservation Omra B2B.
 *
 * Invariants protégés :
 *
 * 1. expectedTotalTnd présent dans OmraBookingInput (booking-actions.ts).
 * 2. priceDrifted importé dans booking-actions.ts.
 * 3. Garde priceDrifted(input.expectedTotalTnd, totalTnd) présente.
 * 4. Garde positionnée AVANT debitPartnerCredit.
 * 5. Garde positionnée AVANT le premier insert customers (avant toute
 *    écriture persistée).
 * 6. Code PRICE_CHANGED dans la map d'erreurs.
 * 7. expectedTotalTnd transmis depuis omra-partner-booking-form.tsx
 *    vers createOmraBooking.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const bookingSrc = readFileSync(
  join(ROOT, "lib/omra/booking-actions.ts"),
  "utf8",
)
const componentSrc = readFileSync(
  join(ROOT, "components/omra/omra-partner-booking-form.tsx"),
  "utf8",
)

// ─── 1. expectedTotalTnd dans OmraBookingInput ────────────────────────────────

test("OMRA-B2B-DRIFT-01: expectedTotalTnd présent dans OmraBookingInput", () => {
  const ifaceIdx = bookingSrc.indexOf("OmraBookingInput")
  assert.ok(ifaceIdx !== -1, "OmraBookingInput non trouvé")
  assert.match(bookingSrc.slice(ifaceIdx, ifaceIdx + 600), /expectedTotalTnd/)
})

// ─── 2. Import de priceDrifted ────────────────────────────────────────────────

test("OMRA-B2B-DRIFT-01: priceDrifted importé depuis @/lib/booking/pricing", () => {
  assert.match(bookingSrc, /priceDrifted/)
  assert.match(bookingSrc, /from.*@\/lib\/booking\/pricing/)
})

// ─── 3. Appel priceDrifted(input.expectedTotalTnd, totalTnd) ─────────────────

test("OMRA-B2B-DRIFT-01: priceDrifted(input.expectedTotalTnd, totalTnd) présent", () => {
  assert.match(
    bookingSrc,
    /priceDrifted\(input\.expectedTotalTnd,\s*totalTnd\)/,
  )
})

// ─── 4. Garde AVANT debitPartnerCredit ───────────────────────────────────────

test("OMRA-B2B-DRIFT-01: garde priceDrifted positionnée avant debitPartnerCredit", () => {
  const driftIdx = bookingSrc.indexOf("priceDrifted(input.expectedTotalTnd")
  const debitIdx = bookingSrc.indexOf("debitPartnerCredit(")
  assert.ok(driftIdx !== -1, "priceDrifted non trouvé")
  assert.ok(debitIdx !== -1, "debitPartnerCredit non trouvé")
  assert.ok(driftIdx < debitIdx, "garde drift DOIT précéder debitPartnerCredit")
})

// ─── 5. Garde AVANT tout insert (customers) ──────────────────────────────────

test("OMRA-B2B-DRIFT-01: garde priceDrifted positionnée avant tout insert persisté", () => {
  const driftIdx = bookingSrc.indexOf("priceDrifted(input.expectedTotalTnd")
  const insertIdx = bookingSrc.indexOf(".insert(customers)")
  assert.ok(driftIdx !== -1, "priceDrifted non trouvé")
  assert.ok(insertIdx !== -1, "insert customers non trouvé")
  assert.ok(
    driftIdx < insertIdx,
    "garde drift DOIT précéder le premier insert customers",
  )
})

// ─── 6. Code PRICE_CHANGED dans la map d'erreurs ─────────────────────────────

test("OMRA-B2B-DRIFT-01: code PRICE_CHANGED dans la map d'erreurs", () => {
  assert.match(bookingSrc, /PRICE_CHANGED/)
})

// ─── 7. expectedTotalTnd transmis depuis le composant ────────────────────────

test("OMRA-B2B-DRIFT-01: expectedTotalTnd transmis dans l'appel createOmraBooking du composant", () => {
  const callIdx = componentSrc.indexOf("createOmraBooking(")
  assert.ok(callIdx !== -1, "createOmraBooking non trouvé dans le composant")
  assert.match(componentSrc.slice(callIdx, callIdx + 300), /expectedTotalTnd/)
})
