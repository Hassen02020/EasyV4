/**
 * OMRA-B2C-DRIFT-01 — invariants statiques et comportementaux sur la
 * garde anti-drift de prix (CART-DRIFT-01) pour le chemin de réservation
 * Omra B2C (createGuestOmraBooking).
 *
 * Invariants protégés :
 *
 * 1. expectedTotalTnd présent dans le wrapper createGuestOmraBooking.
 * 2. priceDrifted importé dans guest-booking-actions.ts.
 * 3. Garde priceDrifted(expectedTotalTnd, totalTnd) présente.
 * 4. Garde positionnée AVANT applyPromoDiscountCore (promo).
 * 5. Garde positionnée AVANT le premier insert customers (avant toute
 *    écriture persistée).
 * 6. Code PRICE_CHANGED dans la map d'erreurs.
 * 7. expectedTotalTnd transmis depuis omra-guest-booking-form.tsx.
 * 8. [comportemental] priceDrifted(100, 200) retourne true.
 * 9. [comportemental] priceDrifted(undefined, 200) retourne false.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const guestActionSrc = readFileSync(
  join(ROOT, "lib/omra/guest-booking-actions.ts"),
  "utf8",
)
const componentSrc = readFileSync(
  join(ROOT, "components/omra/omra-guest-booking-form.tsx"),
  "utf8",
)

// ─── 1. expectedTotalTnd dans le wrapper createGuestOmraBooking ──────────────

test("OMRA-B2C-DRIFT-01: expectedTotalTnd présent dans le wrapper createGuestOmraBooking", () => {
  const wrapperIdx = guestActionSrc.indexOf("createGuestOmraBooking(")
  assert.ok(wrapperIdx !== -1, "createGuestOmraBooking non trouvé")
  assert.match(
    guestActionSrc.slice(wrapperIdx, wrapperIdx + 700),
    /expectedTotalTnd/,
  )
})

// ─── 2. Import de priceDrifted ────────────────────────────────────────────────

test("OMRA-B2C-DRIFT-01: priceDrifted importé depuis @/lib/booking/pricing", () => {
  assert.match(guestActionSrc, /priceDrifted/)
  assert.match(guestActionSrc, /from.*@\/lib\/booking\/pricing/)
})

// ─── 3. Appel priceDrifted(expectedTotalTnd, totalTnd) ───────────────────────

test("OMRA-B2C-DRIFT-01: priceDrifted(expectedTotalTnd, totalTnd) présent", () => {
  assert.match(guestActionSrc, /priceDrifted\(expectedTotalTnd,\s*totalTnd\)/)
})

// ─── 4. Garde AVANT applyPromoDiscountCore ───────────────────────────────────

test("OMRA-B2C-DRIFT-01: garde priceDrifted positionnée avant applyPromoDiscountCore", () => {
  const driftIdx = guestActionSrc.indexOf("priceDrifted(expectedTotalTnd")
  const promoIdx = guestActionSrc.indexOf("applyPromoDiscountCore(")
  assert.ok(driftIdx !== -1, "priceDrifted non trouvé")
  assert.ok(promoIdx !== -1, "applyPromoDiscountCore non trouvé")
  assert.ok(
    driftIdx < promoIdx,
    "garde drift DOIT précéder applyPromoDiscountCore",
  )
})

// ─── 5. Garde AVANT tout insert (customers) ──────────────────────────────────

test("OMRA-B2C-DRIFT-01: garde priceDrifted positionnée avant tout insert persisté", () => {
  const driftIdx = guestActionSrc.indexOf("priceDrifted(expectedTotalTnd")
  const insertIdx = guestActionSrc.indexOf(".insert(customers)")
  assert.ok(driftIdx !== -1, "priceDrifted non trouvé")
  assert.ok(insertIdx !== -1, "insert customers non trouvé")
  assert.ok(
    driftIdx < insertIdx,
    "garde drift DOIT précéder le premier insert customers",
  )
})

// ─── 6. Code PRICE_CHANGED dans la map d'erreurs ─────────────────────────────

test("OMRA-B2C-DRIFT-01: code PRICE_CHANGED dans la map d'erreurs", () => {
  assert.match(guestActionSrc, /PRICE_CHANGED/)
})

// ─── 7. expectedTotalTnd transmis depuis le composant ────────────────────────

test("OMRA-B2C-DRIFT-01: expectedTotalTnd transmis dans l'appel createGuestOmraBooking du composant", () => {
  const callIdx = componentSrc.indexOf("createGuestOmraBooking(")
  assert.ok(
    callIdx !== -1,
    "createGuestOmraBooking non trouvé dans le composant",
  )
  assert.match(componentSrc.slice(callIdx, callIdx + 300), /expectedTotalTnd/)
})

// ─── 8. [comportemental] priceDrifted(100, 200) → true ───────────────────────

test("OMRA-B2C-DRIFT-01: priceDrifted(100, 200) retourne true (prix changé)", async () => {
  const { priceDrifted } = await import("@/lib/booking/pricing")
  assert.strictEqual(priceDrifted(100, 200), true)
})

// ─── 9. [comportemental] priceDrifted(undefined, 200) → false ────────────────

test("OMRA-B2C-DRIFT-01: priceDrifted(undefined, 200) retourne false (flux serveur-à-serveur)", async () => {
  const { priceDrifted } = await import("@/lib/booking/pricing")
  assert.strictEqual(priceDrifted(undefined, 200), false)
})
