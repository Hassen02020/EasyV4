/**
 * COMMISSION-WIRING-01/mygo-hotel — invariants statiques sur le câblage financier
 * des deux chemins de réservation hôtel myGo :
 *   - lib/booking/actions.ts      (B2B pro — débit wallet agence)
 *   - lib/booking/guest-actions.ts (B2C guest — paiement Paymee)
 *
 * Invariants protégés :
 *
 * ACTIONS.TS (B2B) :
 * 1. Guard `draft.module === "hotel" && myGoBooking` — pas d'appel financier
 *    pour les autres modules (omra/transfert/voiture) ni si myGo n'a pas
 *    confirmé (absence de myGoBooking).
 * 2. supplierPriceTnd = myGoBooking.totalPrice — prix autoritaire myGo,
 *    JAMAIS draft.unitPriceTnd (valeur client non signée).
 * 3. salePriceTnd = agencyHotelPrice — prix agence post-marge.
 * 4. recordReservationFinancials appelé AVANT creditPlatformCommission
 *    (commissionAmount doit être connu avant d'être crédité).
 * 5. economic_entitlements : external_supplier + seller_margin + commission
 *    (trois parties : fournisseur, agence, Easy2Book).
 * 6. Commission description contient "Commission hôtel — réservation".
 *
 * GUEST-ACTIONS.TS (B2C) :
 * 7. Guard `draft.module === "hotel"` — conditionnement module.
 * 8. supplierPriceTnd = myGoBooking.totalPrice — même source autoritaire.
 * 9. salePriceTnd = agencyPrice — prix agence (variable B2C, pas agencyHotelPrice).
 * 10. recordReservationFinancials AVANT creditPlatformCommission — même ordre.
 * 11. Commission description contient "Commission hôtel — réservation".
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const actionsSrc = readFileSync(join(ROOT, "lib/booking/actions.ts"), "utf8")
const guestSrc = readFileSync(
  join(ROOT, "lib/booking/guest-actions.ts"),
  "utf8",
)

// ─── ACTIONS.TS (B2B) : Invariant 1 : guard module + myGoBooking ─────────────

test('COMMISSION-WIRING-01/mygo-b2b : guard "draft.module === \\"hotel\\" && myGoBooking" avant les appels financiers', () => {
  assert.match(
    actionsSrc,
    /if\s*\(\s*draft\.module\s*===\s*["']hotel["']\s*&&\s*myGoBooking\s*\)/,
  )
})

// ─── ACTIONS.TS (B2B) : Invariant 2 : supplierPriceTnd depuis myGo ───────────

test("COMMISSION-WIRING-01/mygo-b2b : supplierPriceTnd = myGoBooking.totalPrice (prix autoritaire myGo, jamais draft.unitPriceTnd)", () => {
  assert.match(actionsSrc, /supplierPriceTnd:\s*myGoBooking\.totalPrice/)
})

// ─── ACTIONS.TS (B2B) : Invariant 3 : salePriceTnd = agencyHotelPrice ────────

test("COMMISSION-WIRING-01/mygo-b2b : salePriceTnd = agencyHotelPrice (prix agence post-marge)", () => {
  assert.match(actionsSrc, /salePriceTnd:\s*agencyHotelPrice/)
})

// ─── ACTIONS.TS (B2B) : Invariant 4 : ordre recordReservationFinancials → creditPlatformCommission ──

test("COMMISSION-WIRING-01/mygo-b2b : recordReservationFinancials appelé AVANT creditPlatformCommission", () => {
  const recordIdx = actionsSrc.indexOf("recordReservationFinancials({")
  const creditIdx = actionsSrc.indexOf("await creditPlatformCommission(tx, {")
  assert.ok(recordIdx > 0, "recordReservationFinancials doit exister")
  assert.ok(creditIdx > 0, "creditPlatformCommission doit exister")
  assert.ok(
    recordIdx < creditIdx,
    "recordReservationFinancials doit précéder creditPlatformCommission",
  )
})

// ─── ACTIONS.TS (B2B) : Invariant 5 : economic_entitlements trois parties ────

test("COMMISSION-WIRING-01/mygo-b2b : economicEntitlements contient external_supplier, seller_margin, commission (Easy2Book)", () => {
  // Les trois parties sont réparties sur ~50 lignes — cherche dans le fichier
  // entier : ces valeurs de qualification sont spécifiques à ce contexte.
  assert.match(actionsSrc, /partyType:\s*["']external_supplier["']/)
  assert.match(actionsSrc, /qualification:\s*["']seller_margin["']/)
  assert.match(actionsSrc, /qualification:\s*["']commission["']/)
})

// ─── ACTIONS.TS (B2B) : Invariant 6 : description commission ─────────────────

test('COMMISSION-WIRING-01/mygo-b2b : description commission contient "Commission hôtel — réservation"', () => {
  assert.match(actionsSrc, /Commission h[oô]tel — r[eé]servation/)
})

// ─── GUEST-ACTIONS.TS (B2C) : Invariant 7 : guard module hotel ───────────────

test('COMMISSION-WIRING-01/mygo-b2c : guard "draft.module === \\"hotel\\"" avant les appels financiers', () => {
  assert.match(guestSrc, /if\s*\(\s*draft\.module\s*===\s*["']hotel["']\s*\)/)
})

// ─── GUEST-ACTIONS.TS (B2C) : Invariant 8 : supplierPriceTnd depuis myGo ─────

test("COMMISSION-WIRING-01/mygo-b2c : supplierPriceTnd = myGoBooking.totalPrice (prix autoritaire myGo)", () => {
  assert.match(guestSrc, /supplierPriceTnd:\s*myGoBooking\.totalPrice/)
})

// ─── GUEST-ACTIONS.TS (B2C) : Invariant 9 : salePriceTnd = agencyPrice ───────

test("COMMISSION-WIRING-01/mygo-b2c : salePriceTnd = agencyPrice (prix agence B2C)", () => {
  assert.match(guestSrc, /salePriceTnd:\s*agencyPrice/)
})

// ─── GUEST-ACTIONS.TS (B2C) : Invariant 10 : ordre recordReservationFinancials → creditPlatformCommission ──

test("COMMISSION-WIRING-01/mygo-b2c : recordReservationFinancials appelé AVANT creditPlatformCommission", () => {
  const recordIdx = guestSrc.indexOf("recordReservationFinancials({")
  const creditIdx = guestSrc.indexOf("await creditPlatformCommission(tx, {")
  assert.ok(recordIdx > 0, "recordReservationFinancials doit exister")
  assert.ok(creditIdx > 0, "creditPlatformCommission doit exister")
  assert.ok(
    recordIdx < creditIdx,
    "recordReservationFinancials doit précéder creditPlatformCommission",
  )
})

// ─── GUEST-ACTIONS.TS (B2C) : Invariant 11 : description commission ──────────

test('COMMISSION-WIRING-01/mygo-b2c : description commission contient "Commission hôtel — réservation"', () => {
  assert.match(guestSrc, /Commission h[oô]tel — r[eé]servation/)
})
