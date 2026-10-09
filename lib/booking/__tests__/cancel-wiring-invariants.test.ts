/**
 * CANCEL-WIRING-01 — invariants statiques sur les deux chemins d'annulation
 * hôtel myGo :
 *   - lib/booking/cancel-actions.ts         (B2B pro — annulation partenaire)
 *   - lib/booking/customer-cancel-actions.ts (B2C client — annulation propre)
 *
 * Invariants protégés :
 *
 * CANCEL-ACTIONS.TS (B2B) :
 * 1. CANCELLABLE_STATUSES guard — statuts autorisés : confirmed / pending /
 *    on_request — jamais un status arbitraire.
 * 2. providerBookingId guard — module=hotel ET providerBookingId obligatoires
 *    (jamais d'annulation sans référence myGo réelle).
 * 3. FOR UPDATE lock — verrou exclusif avant écriture financière.
 * 4. Race protection — ALREADY_CANCELLED_CONCURRENTLY lancé si réservation
 *    déjà annulée entre pré-check et verrou (no double-refund).
 * 5. Append-only wallet — INSERT partnerCreditMovements movementType="refund"
 *    (jamais UPDATE d'un mouvement existant).
 * 6. Balance via DB function — set_agency_deposit_balance() appelé via SQL
 *    raw, jamais tx.update(agencies).
 * 7. recordCancellationFinancials appelé.
 * 8. Refund floor — Math.max(0, ...) — remboursement jamais négatif.
 *
 * CUSTOMER-CANCEL-ACTIONS.TS (B2C) :
 * 9.  SÉCURITÉ AUTH — ownedByCurrentCustomer dans le WHERE (scope = SA propre
 *     réservation, jamais toute l'agence).
 * 10. NOT_FOUND sur accès non autorisé — code: "NOT_FOUND" (jamais FORBIDDEN
 *     qui confirmerait l'existence de la résa).
 * 11. Customer wallet — applyReservationRefund (wallet client, pas agence).
 * 12. NO_CAPTURED_PAYMENT est un no-op légitime — l'annulation aboutit quand
 *     même (réservation jamais payée : cash/virement pending).
 * 13. recordCancellationFinancials appelé.
 * 14. Loyalty reversal — reverseEarnedPoints + reinstateRedeemedPoints.
 * 15. Race protection — ALREADY_CANCELLED_CONCURRENTLY également présent.
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const cancelSrc = readFileSync(
  join(ROOT, "lib/booking/cancel-actions.ts"),
  "utf8",
)
const customerCancelSrc = readFileSync(
  join(ROOT, "lib/booking/customer-cancel-actions.ts"),
  "utf8",
)

// ─── CANCEL-ACTIONS.TS (B2B) : Invariant 1 : CANCELLABLE_STATUSES ────────────

test('CANCEL-WIRING-01/b2b : CANCELLABLE_STATUSES contient "confirmed", "pending", "on_request"', () => {
  assert.match(cancelSrc, /CANCELLABLE_STATUSES\s*=\s*\[/)
  assert.match(cancelSrc, /"confirmed"/)
  assert.match(cancelSrc, /"pending"/)
  assert.match(cancelSrc, /"on_request"/)
})

// ─── CANCEL-ACTIONS.TS (B2B) : Invariant 2 : providerBookingId guard ─────────

test("CANCEL-WIRING-01/b2b : guard module === \"hotel\" && providerBookingId (jamais d'annulation sans référence myGo)", () => {
  assert.match(
    cancelSrc,
    /preCheck\.module\s*!==\s*["']hotel["']\s*\|\|\s*!preCheck\.providerBookingId/,
  )
})

// ─── CANCEL-ACTIONS.TS (B2B) : Invariant 3 : FOR UPDATE lock ─────────────────

test("CANCEL-WIRING-01/b2b : verrou FOR UPDATE avant toute écriture financière", () => {
  assert.match(cancelSrc, /\.for\s*\(\s*["']update["']\s*\)/)
})

// ─── CANCEL-ACTIONS.TS (B2B) : Invariant 4 : race protection ─────────────────

test('CANCEL-WIRING-01/b2b : ALREADY_CANCELLED_CONCURRENTLY — protection contre double-remboursement concurrent', () => {
  assert.match(cancelSrc, /ALREADY_CANCELLED_CONCURRENTLY/)
})

// ─── CANCEL-ACTIONS.TS (B2B) : Invariant 5 : append-only wallet ──────────────

test('CANCEL-WIRING-01/b2b : INSERT partnerCreditMovements movementType="refund" (append-only, jamais UPDATE)', () => {
  assert.match(cancelSrc, /movementType:\s*["']refund["']/)
  // Vérifier que c'est un INSERT (tx.insert), pas un UPDATE
  assert.match(cancelSrc, /tx\.insert\s*\(\s*partnerCreditMovements\s*\)/)
  assert.doesNotMatch(cancelSrc, /tx\.update\s*\(\s*partnerCreditMovements\s*\)/)
})

// ─── CANCEL-ACTIONS.TS (B2B) : Invariant 6 : balance via DB function ─────────

test("CANCEL-WIRING-01/b2b : set_agency_deposit_balance() via SQL raw — solde mis à jour exclusivement via la fonction DB", () => {
  assert.match(cancelSrc, /set_agency_deposit_balance\s*\(/)
  // La fonction SQL est appelée via sql`` template (jamais tx.update direct)
  assert.match(cancelSrc, /sql`SELECT set_agency_deposit_balance\(/)
})

// ─── CANCEL-ACTIONS.TS (B2B) : Invariant 7 : recordCancellationFinancials ────

test("CANCEL-WIRING-01/b2b : recordCancellationFinancials appelé (traçabilité financière annulation)", () => {
  assert.match(cancelSrc, /recordCancellationFinancials\s*\(\s*\{/)
})

// ─── CANCEL-ACTIONS.TS (B2B) : Invariant 8 : refund floor ───────────────────

test("CANCEL-WIRING-01/b2b : Math.max(0, ...) — remboursement jamais négatif (floor à zéro)", () => {
  assert.match(cancelSrc, /Math\.max\s*\(\s*0\s*,/)
})

// ─── CUSTOMER-CANCEL-ACTIONS.TS (B2C) : Invariant 9 : auth scope ─────────────

test("CANCEL-WIRING-01/b2c : SÉCURITÉ — ownedByCurrentCustomer dans le WHERE (scope = propre réservation uniquement)", () => {
  assert.match(customerCancelSrc, /ownedByCurrentCustomer\s*\(/)
})

// ─── CUSTOMER-CANCEL-ACTIONS.TS (B2C) : Invariant 10 : NOT_FOUND not FORBIDDEN

test('CANCEL-WIRING-01/b2c : SÉCURITÉ — code: "NOT_FOUND" sur accès non autorisé (jamais FORBIDDEN — pas de leak existence)', () => {
  assert.match(customerCancelSrc, /code:\s*["']NOT_FOUND["']/)
  assert.doesNotMatch(customerCancelSrc, /code:\s*["']FORBIDDEN["']/)
})

// ─── CUSTOMER-CANCEL-ACTIONS.TS (B2C) : Invariant 11 : customer wallet ────────

test("CANCEL-WIRING-01/b2c : applyReservationRefund — wallet client (pas wallet agence, pas partnerCreditMovements)", () => {
  assert.match(customerCancelSrc, /applyReservationRefund\s*\(\s*\{/)
  assert.doesNotMatch(customerCancelSrc, /tx\.insert\s*\(\s*partnerCreditMovements\s*\)/)
})

// ─── CUSTOMER-CANCEL-ACTIONS.TS (B2C) : Invariant 12 : NO_CAPTURED_PAYMENT ───

test('CANCEL-WIRING-01/b2c : NO_CAPTURED_PAYMENT est un no-op légitime (annulation aboutit sans remboursement)', () => {
  assert.match(
    customerCancelSrc,
    /refundResult\.code\s*!==\s*["']NO_CAPTURED_PAYMENT["']/,
  )
})

// ─── CUSTOMER-CANCEL-ACTIONS.TS (B2C) : Invariant 13 : recordCancellationFinancials

test("CANCEL-WIRING-01/b2c : recordCancellationFinancials appelé (traçabilité financière annulation B2C)", () => {
  assert.match(customerCancelSrc, /recordCancellationFinancials\s*\(\s*\{/)
})

// ─── CUSTOMER-CANCEL-ACTIONS.TS (B2C) : Invariant 14 : loyalty reversal ──────

test("CANCEL-WIRING-01/b2c : reverseEarnedPoints appelé (annulation des points gagnés)", () => {
  assert.match(customerCancelSrc, /reverseEarnedPoints\s*\(/)
})

test("CANCEL-WIRING-01/b2c : reinstateRedeemedPoints appelé (restitution des points dépensés)", () => {
  assert.match(customerCancelSrc, /reinstateRedeemedPoints\s*\(/)
})

// ─── CUSTOMER-CANCEL-ACTIONS.TS (B2C) : Invariant 15 : race protection ────────

test('CANCEL-WIRING-01/b2c : ALREADY_CANCELLED_CONCURRENTLY — protection contre double-annulation concurrent', () => {
  assert.match(customerCancelSrc, /ALREADY_CANCELLED_CONCURRENTLY/)
})
