/**
 * POLICY-CANCEL-WIRING-01 — invariants statiques sur
 * lib/booking/policy-cancel-core.ts::cancelPolicyReservationCore.
 *
 * Invariants protégés :
 *
 * 1. NO USE SERVER — le fichier est DÉLIBÉRÉMENT sans "use server" : ses
 *    exports ne peuvent jamais devenir des Server Actions Next.js (l'identité
 *    est passée en paramètre plutôt que lue depuis une session live).
 *
 * 2. CANCELLABLE_MODULES — seuls "omra", "package", "activity" sont
 *    annulables par ce mécanisme ; tout autre module retourne une erreur.
 *
 * 3. NOT_FOUND jamais FORBIDDEN — ownedByCurrentCustomer ne confirme jamais
 *    l'existence d'une réservation appartenant à un autre client (NOT_FOUND
 *    plutôt que FORBIDDEN pour ne pas révéler l'existence).
 *
 * 4. FOR UPDATE × 4 — verrou exclusif sur reservations (anti double-clic)
 *    ET sur chaque table de stock (omraAllotments/catalogPackageDepartures/
 *    catalogActivitySessions) avant toute mise à jour de capacité.
 *
 * 5. ALREADY_CANCELLED_CONCURRENTLY — après le FOR UPDATE, le statut est
 *    re-vérifié : throw ALREADY_CANCELLED_CONCURRENTLY si déjà annulé par
 *    un autre appel concurrent.
 *
 * 6. policySnapshot figé — evaluateCancellation() opère sur le snapshot
 *    stocké dans providerPayload (jamais une résolution live de la politique
 *    — pour ne jamais modifier rétroactivement ce qu'un client a accepté).
 *
 * 7. isValidWalletAmount avant applyReservationRefund — un crédit de 0 DT
 *    (frais 100%, politique "no refund") ne doit PAS appeler le wallet
 *    (creditCustomerWallet rejette les montants <= 0, ce qui ferait rollback
 *    toute la transaction et empêcherait l'annulation elle-même).
 *
 * 8. applyReservationRefund dans la transaction (tx passé en argument) —
 *    jamais hors transaction, jamais un second mécanisme de crédit.
 *
 * 9. NO_CAPTURED_PAYMENT no-op + throw sur autre échec — si code
 *    NO_CAPTURED_PAYMENT (réservation jamais payée), l'annulation continue ;
 *    tout autre échec de remboursement throw (rollback complet).
 *
 * 10. reverseEarnedPoints + reinstateRedeemedPoints dans la MÊME transaction
 *     (même tx que l'annulation — atomicité points + statut).
 *
 * 11. status="cancelled" dans la transaction (jamais orphelin).
 *
 * 12. ownedByCurrentCustomer utilisé (jamais élargissement à toute l'agence).
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/booking/policy-cancel-core.ts"),
  "utf8",
)

// ─── Invariant 1 : pas de "use server" ───────────────────────────────────────

test('POLICY-CANCEL-WIRING-01 : pas de "use server" — exports ne peuvent jamais devenir des Server Actions (identité passée en paramètre)', () => {
  // La directive "use server" est toujours en début de ligne, seule.
  // Les occurrences dans les commentaires sont entourées de backticks ou
  // de texte, jamais en début de ligne.
  assert.doesNotMatch(src, /^["']use server["']\s*$/m)
})

// ─── Invariant 2 : CANCELLABLE_MODULES ───────────────────────────────────────

test('POLICY-CANCEL-WIRING-01 : CANCELLABLE_MODULES contient "omra", "package", "activity" (tout autre module retourne une erreur)', () => {
  assert.match(src, /CANCELLABLE_MODULES/)
  assert.match(src, /["']omra["']/)
  assert.match(src, /["']package["']/)
  assert.match(src, /["']activity["']/)
})

test("POLICY-CANCEL-WIRING-01 : vérification CANCELLABLE_MODULES.includes() — module invalide exclu avant toute écriture DB", () => {
  assert.match(src, /CANCELLABLE_MODULES\.includes\s*\(/)
})

// ─── Invariant 3 : NOT_FOUND jamais FORBIDDEN ────────────────────────────────

test('POLICY-CANCEL-WIRING-01 : NOT_FOUND retourné (jamais FORBIDDEN) — ownedByCurrentCustomer ne révèle pas l\'existence d\'une réservation tiers', () => {
  assert.match(src, /code:\s*["']NOT_FOUND["']/)
  assert.doesNotMatch(src, /code:\s*["']FORBIDDEN["']/)
})

// ─── Invariant 4 : FOR UPDATE × 4 ───────────────────────────────────────────

test("POLICY-CANCEL-WIRING-01 : FOR UPDATE au moins 4 fois — reservations + omraAllotments + catalogPackageDepartures + catalogActivitySessions", () => {
  const occurrences = src.match(/\.for\s*\(\s*["']update["']\s*\)/g)
  assert.ok(
    occurrences !== null && occurrences.length >= 4,
    `FOR UPDATE doit apparaître au moins 4 fois, trouvé : ${occurrences?.length ?? 0}`,
  )
})

// ─── Invariant 5 : ALREADY_CANCELLED_CONCURRENTLY ────────────────────────────

test("POLICY-CANCEL-WIRING-01 : ALREADY_CANCELLED_CONCURRENTLY throw après FOR UPDATE (anti double-clic concurrent)", () => {
  assert.match(src, /ALREADY_CANCELLED_CONCURRENTLY/)
  const forUpdateIdx = src.indexOf('.for("update")')
  const alreadyCancelledIdx = src.indexOf("ALREADY_CANCELLED_CONCURRENTLY")
  assert.ok(forUpdateIdx > 0, "FOR UPDATE doit exister")
  assert.ok(alreadyCancelledIdx > 0, "ALREADY_CANCELLED_CONCURRENTLY doit exister")
  assert.ok(
    forUpdateIdx < alreadyCancelledIdx,
    "FOR UPDATE doit précéder ALREADY_CANCELLED_CONCURRENTLY",
  )
})

// ─── Invariant 6 : policySnapshot figé ──────────────────────────────────────

test("POLICY-CANCEL-WIRING-01 : policySnapshot depuis providerPayload (jamais résolution live de la politique — snapshot figé à la réservation)", () => {
  assert.match(src, /providerPayload\.policySnapshot/)
  assert.match(src, /evaluateCancellation\s*\(\s*snapshot/)
})

// ─── Invariant 7 : isValidWalletAmount avant applyReservationRefund ──────────

test("POLICY-CANCEL-WIRING-01 : isValidWalletAmount(creditableTnd) — skip wallet si montant <= 0 (évite rollback sur crédit 0 DT)", () => {
  assert.match(src, /isValidWalletAmount\s*\(\s*creditableTnd\s*\)/)
  const validAmountIdx = src.indexOf("isValidWalletAmount(creditableTnd)")
  const refundCallIdx = src.indexOf("applyReservationRefund({")
  assert.ok(validAmountIdx > 0, "isValidWalletAmount(creditableTnd) doit exister")
  assert.ok(refundCallIdx > 0, "applyReservationRefund({ doit exister")
  assert.ok(
    validAmountIdx < refundCallIdx,
    "isValidWalletAmount guard doit précéder applyReservationRefund",
  )
})

// ─── Invariant 8 : applyReservationRefund dans la transaction ────────────────

test("POLICY-CANCEL-WIRING-01 : applyReservationRefund({ tx, ... }) — dans la transaction, jamais hors transaction", () => {
  // tx est la première propriété de l'objet passé à applyReservationRefund
  assert.match(src, /applyReservationRefund\s*\(\s*\{[\s\S]{0,50}tx,/)
})

// ─── Invariant 9 : NO_CAPTURED_PAYMENT no-op + throw sur autre échec ──────────

test('POLICY-CANCEL-WIRING-01 : NO_CAPTURED_PAYMENT est un no-op (réservation jamais payée) — tout autre échec throw (rollback complet)', () => {
  assert.match(src, /refundResult\.code\s*!==\s*["']NO_CAPTURED_PAYMENT["']/)
  assert.match(src, /throw new Error\s*\(\s*refundResult\.error\s*\)/)
  // Le check NO_CAPTURED_PAYMENT doit précéder le throw
  const noCaptureIdx = src.indexOf("NO_CAPTURED_PAYMENT")
  const throwRefundIdx = src.indexOf("throw new Error(refundResult.error)")
  assert.ok(noCaptureIdx > 0, "NO_CAPTURED_PAYMENT check doit exister")
  assert.ok(throwRefundIdx > 0, "throw new Error(refundResult.error) doit exister")
  assert.ok(
    noCaptureIdx < throwRefundIdx,
    "NO_CAPTURED_PAYMENT check doit précéder le throw",
  )
})

// ─── Invariant 10 : loyalty dans la même transaction ─────────────────────────

test("POLICY-CANCEL-WIRING-01 : reverseEarnedPoints(tx, ...) dans la même transaction (atomicité points + statut)", () => {
  assert.match(src, /reverseEarnedPoints\s*\(\s*tx,/)
})

test("POLICY-CANCEL-WIRING-01 : reinstateRedeemedPoints(tx, ...) dans la même transaction (points dépensés restitués atomiquement)", () => {
  assert.match(src, /reinstateRedeemedPoints\s*\(\s*tx,/)
})

// ─── Invariant 11 : status="cancelled" dans la transaction ──────────────────

test('POLICY-CANCEL-WIRING-01 : status: "cancelled" mis à jour dans la même transaction que le remboursement (jamais de statut orphelin)', () => {
  assert.match(src, /status:\s*["']cancelled["']/)
  // Le set status=cancelled doit suivre le FOR UPDATE
  const forUpdateIdx = src.indexOf('.for("update")')
  const cancelledSetIdx = src.indexOf('status: "cancelled"')
  assert.ok(forUpdateIdx > 0, "FOR UPDATE doit exister")
  assert.ok(cancelledSetIdx > 0, 'status: "cancelled" doit exister')
  assert.ok(
    forUpdateIdx < cancelledSetIdx,
    'FOR UPDATE doit précéder le set status: "cancelled"',
  )
})

// ─── Invariant 12 : ownedByCurrentCustomer ───────────────────────────────────

test("POLICY-CANCEL-WIRING-01 : ownedByCurrentCustomer({ ... }) — appartenance vérifiée par authUserId/email (jamais élargie à toute l'agence)", () => {
  assert.match(src, /ownedByCurrentCustomer\s*\(\s*\{/)
})
