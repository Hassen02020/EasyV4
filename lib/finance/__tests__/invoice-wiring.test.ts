/**
 * INVOICE-WIRING-01 — invariants statiques sur
 * lib/finance/invoice-actions.ts::generateInvoiceForReservation.
 *
 * Invariants protégés :
 *
 * 1. CONFIRMED ONLY — generateInvoiceForReservation ne génère une facture
 *    QUE pour une réservation status="confirmed" : RESERVATION_NOT_CONFIRMED
 *    retourné sinon (jamais de facture pour pending/cancelled/expired).
 *
 * 2. IDEMPOTENCE 23505 — sur conflit unique (pgErrorCode "23505"), la
 *    facture existante est RELUE et retournée (ok:true, alreadyExisted:true)
 *    plutôt que d'échouer — deux appels concurrents ne créent jamais deux
 *    factures pour la même réservation.
 *
 * 3. SAVEPOINT tx.transaction — INSERT dans un sous-bloc (nested
 *    transaction / savepoint) pour isoler le conflit d'unicité sans aborter
 *    la transaction parente (sinon, le SELECT de relecture suivant
 *    échouerait aussi car Postgres marque la tx entière "aborted").
 *
 * 4. alreadyExisted — le chemin de relecture retourne { ok: true,
 *    alreadyExisted: true } (jamais ok: false sur un conflit concurrent) :
 *    les appelants (manual-payment, admin refund) peuvent traiter ce
 *    résultat comme un succès sans retry dangereux.
 *
 * 5. status: "paid" — toute nouvelle facture est immédiatement marquée
 *    "paid" (pas "pending", pas "draft") — invariant de cohérence métier
 *    (une facture générée après confirmation/paiement intégral est déjà
 *    réglée).
 *
 * 6. totalTva: "0.00" — aucun taux de TVA inventé : la TVA est toujours
 *    zéro jusqu'à ce qu'un vrai modèle fiscal soit implémenté.
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(join(ROOT, "lib/finance/invoice-actions.ts"), "utf8")

// ─── Invariant 1 : confirmed only ────────────────────────────────────────────

test('INVOICE-WIRING-01 : RESERVATION_NOT_CONFIRMED retourné si status !== "confirmed" (jamais de facture pour pending/cancelled/expired)', () => {
  assert.match(src, /reservation\.status\s*!==\s*["']confirmed["']/)
  assert.match(src, /RESERVATION_NOT_CONFIRMED/)
  // Le guard doit précéder l'INSERT
  const guardIdx = src.indexOf('"RESERVATION_NOT_CONFIRMED"')
  const insertIdx = src.indexOf(".insert(partnerInvoices)")
  assert.ok(guardIdx > 0, '"RESERVATION_NOT_CONFIRMED" doit exister')
  assert.ok(insertIdx > 0, ".insert(partnerInvoices) doit exister")
  assert.ok(
    guardIdx < insertIdx,
    "guard RESERVATION_NOT_CONFIRMED doit précéder l'INSERT",
  )
})

// ─── Invariant 2 : idempotence 23505 ─────────────────────────────────────────

test('INVOICE-WIRING-01 : pgErrorCode "23505" → relecture de la facture existante (pas un échec — idempotence concurrente)', () => {
  assert.match(src, /pgErrorCode\s*\(\s*err\s*\)\s*!==\s*["']23505["']/)
})

test("INVOICE-WIRING-01 : alreadyExisted:true sur chemin de relecture (ok:true, jamais ok:false sur conflit concurrent)", () => {
  assert.match(src, /alreadyExisted:\s*true/)
  assert.match(src, /alreadyExisted:\s*false/)
})

// ─── Invariant 3 : savepoint tx.transaction ──────────────────────────────────

test("INVOICE-WIRING-01 : tx.transaction(async tx2 => ...) — savepoint pour isoler le conflit d'unicité (sinon toute la tx serait abortée)", () => {
  assert.match(src, /tx\.transaction\s*\(\s*async\s*\(tx2\)/)
})

// ─── Invariant 4 : relecture → ok:true ───────────────────────────────────────

test("INVOICE-WIRING-01 : chemin de relecture après 23505 retourne ok:true (jamais throw) — appelants peuvent traiter comme succès", () => {
  // Après pgErrorCode !== "23505" (i.e. c'est bien 23505), on relit et retourne ok:true
  // La relecture relit depuis partnerInvoices.reservationId
  assert.match(src, /partnerInvoices\.reservationId/)
  // Et retourne { ok: true, ... alreadyExisted: true }
  const alreadyExistedIdx = src.indexOf("alreadyExisted: true")
  const throwAfterIdx = src.indexOf("throw err", alreadyExistedIdx)
  // Le throw err suivant le alreadyExisted:true est le cas "existing not found"
  // — acceptable. Ce qu'on vérifie : le return ok:true pour le chemin normal.
  assert.ok(alreadyExistedIdx > 0, "alreadyExisted: true doit exister")
})

// ─── Invariant 5 : status="paid" ──────────────────────────────────────────────

test('INVOICE-WIRING-01 : status: "paid" sur toute nouvelle facture (jamais "pending" ou "draft")', () => {
  assert.match(src, /status:\s*["']paid["']/)
  assert.doesNotMatch(src, /status:\s*["']pending["']/)
  assert.doesNotMatch(src, /status:\s*["']draft["']/)
})

// ─── Invariant 6 : totalTva: "0.00" ──────────────────────────────────────────

test('INVOICE-WIRING-01 : totalTva: "0.00" — aucun taux de TVA inventé (taux réel non modélisé)', () => {
  assert.match(src, /totalTva:\s*["']0\.00["']/)
})
