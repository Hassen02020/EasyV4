/**
 * B2C-CANCEL-MONDE-01 — invariants statiques sur l'annulation B2C
 * self-service pour les réservations Hôtel Monde (`hotel_monde`).
 *
 * Fichier source audité : lib/booking/customer-cancel-actions.ts
 * Fonction : cancelMyHotelMondeReservation
 *
 * Invariants protégés :
 *
 * 1. MODULE GUARD — module==="hotel_monde" obligatoire (jamais "hotel" ou autre).
 * 2. AUTH GUARD — ownedByCurrentCustomer dans le WHERE (scope propre réservation).
 * 3. NOT_FOUND code — accès non autorisé → code "NOT_FOUND", jamais "FORBIDDEN".
 * 4. CANCELLABLE_STATUSES guard — confirmed/pending/on_request uniquement.
 * 5. FOR UPDATE lock — verrou avant toute mutation financière.
 * 6. RACE PROTECTION — ALREADY_CANCELLED_CONCURRENTLY lancé si déjà annulée.
 * 7. REFUNDABLE FLAG — applyReservationRefund n'est PAS appelé si non remboursable.
 * 8. THREE-WAY REFUND — NO_CAPTURED_PAYMENT = no-op (annulation continue),
 *    ok=true = montant réel, autre erreur = throw REFUND_ERROR (rollback).
 * 9. REFUND ERROR FORMAT — throw "REFUND_ERROR:..." → rollback, réservation
 *    NON annulée, message d'erreur explicite avec publicRef.
 * 10. feeTnd:0 — jamais de frais fournisseur dans cette itération.
 * 11. supplierNotified conditionnel — !!preCheck.providerOfferId (B2C-CANCEL-MONDE-02 :
 *     false si offerId absent, true si annulation fournisseur tentée).
 * 12. AUDIT EVENT — action "reservation.cancelled" avec supplierNotified conditionnel et
 *     requiresSupplierAction:!providerOfferId dans le diff (B2C-CANCEL-MONDE-02).
 * 13. recordCancellationFinancials appelé avec cancellationFeeTnd=0.
 * 14. Loyalty reversal — reverseEarnedPoints + reinstateRedeemedPoints.
 * 15. recordReservationTransition appelé.
 * 16. NO VIRTUAL SUPPLIER CALL — cancel() du moteur virtuel N'EST PAS appelé
 *     (offerId non stocké en DB dans cette itération).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/booking/customer-cancel-actions.ts"),
  "utf8",
)

// Isole la fonction cancelMyHotelMondeReservation (après sa déclaration)
const mondeFnStart = src.indexOf("cancelMyHotelMondeReservation")
assert.ok(mondeFnStart > 0, "cancelMyHotelMondeReservation doit exister")
const mondeSrc = src.slice(mondeFnStart)

// ─── 1. MODULE GUARD ──────────────────────────────────────────────────────────
test("B2C-CANCEL-MONDE-01/01 : module guard hotel_monde présent", () => {
  assert.match(mondeSrc, /module\s*!==\s*["']hotel_monde["']/)
})

// ─── 2. AUTH GUARD ────────────────────────────────────────────────────────────
test("B2C-CANCEL-MONDE-01/02 : ownedByCurrentCustomer dans le WHERE", () => {
  assert.match(mondeSrc, /ownedByCurrentCustomer/)
})

// ─── 3. NOT_FOUND CODE ────────────────────────────────────────────────────────
test('B2C-CANCEL-MONDE-01/03 : code "NOT_FOUND" sur accès non autorisé', () => {
  assert.match(mondeSrc, /code:\s*["']NOT_FOUND["']/)
})

// ─── 4. CANCELLABLE_STATUSES ──────────────────────────────────────────────────
test("B2C-CANCEL-MONDE-01/04 : CANCELLABLE_STATUSES contient les 3 statuts", () => {
  assert.match(src, /CANCELLABLE_STATUSES\s*=\s*\[/)
  assert.match(src, /"confirmed"/)
  assert.match(src, /"pending"/)
  assert.match(src, /"on_request"/)
})

// ─── 5. FOR UPDATE LOCK ───────────────────────────────────────────────────────
test("B2C-CANCEL-MONDE-01/05 : FOR UPDATE lock présent dans la transaction", () => {
  assert.match(mondeSrc, /\.for\(\s*["']update["']\s*\)/)
})

// ─── 6. RACE PROTECTION ───────────────────────────────────────────────────────
test("B2C-CANCEL-MONDE-01/06 : ALREADY_CANCELLED_CONCURRENTLY lancé", () => {
  assert.match(mondeSrc, /ALREADY_CANCELLED_CONCURRENTLY/)
})

// ─── 7. REFUNDABLE GATE ───────────────────────────────────────────────────────
test("B2C-CANCEL-MONDE-01/07 : applyReservationRefund conditionné par refundable", () => {
  assert.match(mondeSrc, /if\s*\(\s*refundable\s*\)/)
  // applyReservationRefund doit être dans le bloc refundable
  const refundableBlock = mondeSrc.indexOf("if (refundable)")
  const applyRefund = mondeSrc.indexOf("applyReservationRefund")
  assert.ok(
    applyRefund > refundableBlock,
    "applyReservationRefund doit être après if(refundable)",
  )
})

// ─── 8. THREE-WAY REFUND ──────────────────────────────────────────────────────
test("B2C-CANCEL-MONDE-01/08 : NO_CAPTURED_PAYMENT traité comme no-op", () => {
  assert.match(mondeSrc, /NO_CAPTURED_PAYMENT/)
  assert.match(mondeSrc, /refundedTnd\s*=\s*0/)
})

// ─── 9. REFUND ERROR → THROW ──────────────────────────────────────────────────
test("B2C-CANCEL-MONDE-01/09 : erreur remboursement → throw REFUND_ERROR (rollback)", () => {
  assert.match(mondeSrc, /throw new Error\(/)
  assert.match(mondeSrc, /REFUND_ERROR:/)
  assert.match(mondeSrc, /REFUND_ERROR.*code.*error/)
})

// ─── 10. feeTnd:0 ─────────────────────────────────────────────────────────────
test("B2C-CANCEL-MONDE-01/10 : feeTnd toujours 0 dans le résultat ok", () => {
  assert.match(mondeSrc, /feeTnd:\s*0/)
})

// ─── 11. supplierNotified conditionnel (B2C-CANCEL-MONDE-02) ─────────────────
// Depuis B2C-CANCEL-MONDE-02 : supplierNotified = !!preCheck.providerOfferId
// (false si offerId absent, true si l'annulation fournisseur a pu être tentée).
test("B2C-CANCEL-MONDE-01/11 : supplierNotified dépend de providerOfferId", () => {
  assert.match(
    mondeSrc,
    /supplierNotified:\s*!!preCheck\.providerOfferId/,
    "supplierNotified doit être !!preCheck.providerOfferId (B2C-CANCEL-MONDE-02)",
  )
})

// ─── 12. AUDIT EVENT ─────────────────────────────────────────────────────────
// Depuis B2C-CANCEL-MONDE-02 : supplierNotified et requiresSupplierAction sont conditionnels.
test('B2C-CANCEL-MONDE-01/12 : audit event "reservation.cancelled" présent', () => {
  assert.match(mondeSrc, /action:\s*["']reservation\.cancelled["']/)
  assert.match(
    mondeSrc,
    /supplierNotified:\s*!!preCheck\.providerOfferId/,
    "supplierNotified dans l'audit doit être conditionnel (B2C-CANCEL-MONDE-02)",
  )
  assert.match(
    mondeSrc,
    /requiresSupplierAction:\s*!preCheck\.providerOfferId/,
    "requiresSupplierAction doit être !preCheck.providerOfferId (B2C-CANCEL-MONDE-02)",
  )
})

// ─── 13. recordCancellationFinancials avec feeTnd=0 ─────────────────────────
test("B2C-CANCEL-MONDE-01/13 : recordCancellationFinancials appelé avec cancellationFeeTnd:0", () => {
  assert.match(mondeSrc, /recordCancellationFinancials/)
  assert.match(mondeSrc, /cancellationFeeTnd:\s*0/)
})

// ─── 14. LOYALTY REVERSAL ─────────────────────────────────────────────────────
test("B2C-CANCEL-MONDE-01/14 : reverseEarnedPoints + reinstateRedeemedPoints", () => {
  assert.match(mondeSrc, /reverseEarnedPoints/)
  assert.match(mondeSrc, /reinstateRedeemedPoints/)
})

// ─── 15. recordReservationTransition ─────────────────────────────────────────
test("B2C-CANCEL-MONDE-01/15 : recordReservationTransition appelé", () => {
  assert.match(mondeSrc, /recordReservationTransition/)
})

// ─── 16. NO VIRTUAL SUPPLIER CALL ────────────────────────────────────────────
test("B2C-CANCEL-MONDE-01/16 : cancel() fournisseur virtuel NON appelé", () => {
  // La fonction cancelWorldHotel (virtual supplier) ne doit pas apparaître
  // dans cancelMyHotelMondeReservation.
  assert.ok(
    !mondeSrc.includes("cancelWorldHotel"),
    "cancelWorldHotel ne doit pas être appelé dans cette itération",
  )
})
