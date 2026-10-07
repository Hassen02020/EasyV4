/**
 * COMMERCIAL-REVENUE-02 — invariants statiques sur le câblage de
 * `recordReservationFinancials` dans le module Car (B2B + guest).
 *
 * Trouvé en audit (COMMERCIAL REVENUE MODEL AUDIT 01) : `lib/cars/pricing.ts`
 * calcule une marge réelle (`applyMargin`, même moteur que Transferts) mais
 * `recordReservationFinancials()` n'était jamais appelé dans
 * `lib/cars/actions.ts` ni `lib/cars/guest-booking-actions.ts` — la marge
 * calculée et facturée au client était donc invisible pour
 * `reservation_financials` / le Dashboard Marges.
 *
 * `"use server"` empêche de charger ces fichiers sous `node --test` hors
 * bundler Next.js (même contrainte que
 * lib/network/__tests__/product-booking-actions-invariants.test.ts) — on
 * vérifie donc le câblage sur le code source réel (readFileSync), comme les
 * autres invariants financiers du repo.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const actionsSrc = readFileSync(join(ROOT, "lib/cars/actions.ts"), "utf8")
const guestActionsSrc = readFileSync(
  join(ROOT, "lib/cars/guest-booking-actions.ts"),
  "utf8",
)

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/* -------------------------------------------------------------------------- */
/* B2B — lib/cars/actions.ts                                                  */
/* -------------------------------------------------------------------------- */

test("actions.ts : importe recordReservationFinancials depuis lib/finance/reservation-financials", () => {
  assert.match(
    actionsSrc,
    /import\s*\{\s*recordReservationFinancials\s*\}\s*from\s*["']@\/lib\/finance\/reservation-financials["']/,
  )
})

test("actions.ts : appelle recordReservationFinancials exactement une fois, avec le split coût/prix réel de calculateCarPrice (jamais un recalcul)", () => {
  assert.equal(
    countOccurrences(actionsSrc, "await recordReservationFinancials("),
    1,
  )
  // ECON-WIRING-01 : le split réel est maintenant capturé dans une variable
  // (carSupplierCostTnd), réutilisée telle quelle pour supplierPriceTnd ET
  // pour la ligne economic_entitlements product_owner — jamais un recalcul.
  assert.match(
    actionsSrc,
    /const carSupplierCostTnd =\s*\n?\s*pricing\.baseTotalTnd \+ pricing\.insuranceTotalTnd/,
  )
  assert.match(actionsSrc, /supplierPriceTnd:\s*carSupplierCostTnd,/)
  assert.match(actionsSrc, /salePriceTnd:\s*pricing\.totalTnd,/)
})

test("actions.ts : recordReservationFinancials est appelé DANS la transaction (avant sa fermeture), APRÈS le débit wallet", () => {
  const debitIdx = actionsSrc.indexOf("await debitPartnerCredit(")
  const financialsIdx = actionsSrc.indexOf("await recordReservationFinancials(")
  const reservationCarIdx = actionsSrc.indexOf(
    "await tx.insert(reservationCar)",
  )
  assert.ok(
    debitIdx > 0 &&
      financialsIdx > debitIdx &&
      financialsIdx < reservationCarIdx,
    "ordre attendu : debit -> recordReservationFinancials -> insert reservationCar, tout dans runInTenantContext",
  )
})

test("actions.ts : passe `tx` (la transaction en cours), jamais une nouvelle transaction", () => {
  const financialsCall = actionsSrc.slice(
    actionsSrc.indexOf("await recordReservationFinancials("),
    actionsSrc.indexOf("await recordReservationFinancials(") + 200,
  )
  assert.match(financialsCall, /tx,/)
})

/* -------------------------------------------------------------------------- */
/* Guest / B2C — lib/cars/guest-booking-actions.ts                            */
/* -------------------------------------------------------------------------- */

test("guest-booking-actions.ts : importe recordReservationFinancials depuis lib/finance/reservation-financials", () => {
  assert.match(
    guestActionsSrc,
    /import\s*\{\s*recordReservationFinancials\s*\}\s*from\s*["']@\/lib\/finance\/reservation-financials["']/,
  )
})

test("guest-booking-actions.ts : appelle recordReservationFinancials exactement une fois, avec le split coût/prix réel de calculateCarPrice (jamais un recalcul)", () => {
  assert.equal(
    countOccurrences(guestActionsSrc, "await recordReservationFinancials("),
    1,
  )
  assert.match(
    guestActionsSrc,
    /const carSupplierCostTnd =\s*\n?\s*pricing\.baseTotalTnd \+ pricing\.insuranceTotalTnd/,
  )
  assert.match(guestActionsSrc, /supplierPriceTnd:\s*carSupplierCostTnd,/)
  assert.match(guestActionsSrc, /salePriceTnd:\s*pricing\.totalTnd,/)
})

test("guest-booking-actions.ts : recordReservationFinancials est appelé DANS la transaction (avant sa fermeture), APRÈS l'insertion du paiement", () => {
  const paymentIdx = guestActionsSrc.indexOf("await tx.insert(payments)")
  const financialsIdx = guestActionsSrc.indexOf(
    "await recordReservationFinancials(",
  )
  const reservationCarIdx = guestActionsSrc.indexOf(
    "await tx.insert(reservationCar)",
  )
  assert.ok(
    paymentIdx > 0 &&
      financialsIdx > paymentIdx &&
      financialsIdx < reservationCarIdx,
    "ordre attendu : insert payments -> recordReservationFinancials -> insert reservationCar, tout dans withTenantContext",
  )
})

/* -------------------------------------------------------------------------- */
/* Non-régression — aucune modification de la marge elle-même                 */
/* -------------------------------------------------------------------------- */

test("actions.ts / guest-booking-actions.ts : totalTnd (montant débité/facturé) reste `pricing.totalTnd`, jamais recalculé pour le financials", () => {
  assert.match(actionsSrc, /const totalTnd = pricing\.totalTnd/)
  assert.match(guestActionsSrc, /const totalTnd = pricing\.totalTnd/)
})

/* -------------------------------------------------------------------------- */
/* CARS-COMMISSION-01 — câblage creditPlatformCommission (COMMERCIAL-REVENUE-04) */
/* -------------------------------------------------------------------------- */

test("actions.ts : importe creditPlatformCommission depuis lib/finance/platform-commission", () => {
  assert.match(
    actionsSrc,
    /import\s*\{[^}]*creditPlatformCommission[^}]*\}\s*from\s*["']@\/lib\/finance\/platform-commission["']/,
  )
})

test("guest-booking-actions.ts : importe creditPlatformCommission depuis lib/finance/platform-commission", () => {
  assert.match(
    guestActionsSrc,
    /import\s*\{[^}]*creditPlatformCommission[^}]*\}\s*from\s*["']@\/lib\/finance\/platform-commission["']/,
  )
})

test("actions.ts : destructure commissionAmount depuis recordReservationFinancials", () => {
  assert.match(
    actionsSrc,
    /const\s*\{[^}]*commissionAmount[^}]*\}\s*=\s*await\s+recordReservationFinancials\(/,
  )
})

test("guest-booking-actions.ts : destructure commissionAmount depuis recordReservationFinancials", () => {
  assert.match(
    guestActionsSrc,
    /const\s*\{[^}]*commissionAmount[^}]*\}\s*=\s*await\s+recordReservationFinancials\(/,
  )
})

test("actions.ts : creditPlatformCommission description inclut publicRef", () => {
  assert.match(actionsSrc, /description:\s*`[^`]*\$\{publicRef\}[^`]*`/)
})

test("guest-booking-actions.ts : creditPlatformCommission description inclut publicRef", () => {
  assert.match(guestActionsSrc, /description:\s*`[^`]*\$\{publicRef\}[^`]*`/)
})
