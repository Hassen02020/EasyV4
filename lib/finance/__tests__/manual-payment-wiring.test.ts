/**
 * MANUAL-PAYMENT-WIRING-01 — invariants statiques sur
 * lib/finance/manual-payment-actions.ts (validation paiement manuel staff).
 *
 * Invariants protégés :
 *
 * 1. ROLE GUARD — MANUAL_PAYMENT_ALLOWED_ROLES importé depuis manual-payment-logic
 *    (exportable sans "use server") ; code "UNAUTHORIZED" si rôle non autorisé.
 *
 * 2. FOR UPDATE lock — verrou exclusif avant tout INSERT payments (anti
 *    double-débit concurrent). Doit précéder l'INSERT payments dans le code.
 *
 * 3. CROSS-AGENCY super_admin — agencyId résolu depuis reservations.agencyId
 *    (ligne RÉELLE de la réservation, jamais profile.agencyId). isSuperAdmin →
 *    agencyId:null dans withTenantContext (RLS bypass correct).
 *
 * 4. IDEMPOTENCY KEY — format `manual:${row.id}:${input.method}:${input.reference}`
 *    + contrainte DB payments_capture_idempotency_uniq (migration 0027).
 *
 * 5. ALREADY_PROCESSED — sur pgErrorCode "23505" (unique constraint), retourne
 *    code "ALREADY_PROCESSED" (jamais throw brut → jamais le client voit
 *    une erreur interne sur un double-clic).
 *
 * 6. WALLET DEBIT FAILURE → THROW (rollback complet) — ManualWalletDebitFailedError
 *    throw (pas return) : garantit que l'INSERT payments est rollback si le
 *    débit wallet échoue — jamais une ligne "captured" orpheline.
 *
 * 7. AMOUNT_EXCEEDS_REMAINING guard — solde restant calculé server-side via
 *    getReservationPaymentSummary (jamais fourni par le client).
 *
 * 8. FULLY_PAID → status="confirmed" — seulement quand remainingAfter ≤
 *    TND_EPSILON. Un acompte partiel laisse le statut "pending".
 *
 * 9. SAVEPOINT isolation — tx.transaction(tx2 => ...) utilisé pour l'INSERT
 *    payments (isoler le conflit d'idempotence sans aborter la tx parente).
 *
 * 10. generateInvoiceForReservation best-effort — appelé UNIQUEMENT quand
 *     fullyPaid (jamais pour un acompte partiel), dans un try/catch séparé
 *     hors transaction (réservation déjà commitée).
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
  join(ROOT, "lib/finance/manual-payment-actions.ts"),
  "utf8",
)
const logicSrc = readFileSync(
  join(ROOT, "lib/finance/manual-payment-logic.ts"),
  "utf8",
)

// ─── Invariant 1 : role guard ─────────────────────────────────────────────────

test("MANUAL-PAYMENT-WIRING-01 : MANUAL_PAYMENT_ALLOWED_ROLES importé depuis manual-payment-logic (exportable hors use-server)", () => {
  assert.match(
    src,
    /MANUAL_PAYMENT_ALLOWED_ROLES[\s\S]{0,200}from[\s\S]{0,50}manual-payment-logic/,
  )
})

test('MANUAL-PAYMENT-WIRING-01 : role check — code "UNAUTHORIZED" retourné si rôle non autorisé', () => {
  assert.match(src, /code:\s*["']UNAUTHORIZED["']/)
})

test('MANUAL-PAYMENT-WIRING-01 : MANUAL_PAYMENT_ALLOWED_ROLES inclut "super_admin", "manager", "agent_compta" (via manual-payment-logic)', () => {
  assert.match(logicSrc, /["']super_admin["']/)
  assert.match(logicSrc, /["']manager["']/)
  assert.match(logicSrc, /["']agent_compta["']/)
})

// ─── Invariant 2 : FOR UPDATE lock ───────────────────────────────────────────

test("MANUAL-PAYMENT-WIRING-01 : FOR UPDATE lock avant INSERT payments (anti double-débit concurrent)", () => {
  assert.match(src, /\.for\s*\(\s*["']update["']\s*\)/)
  // Le verrou doit précéder l'INSERT payments (via savepoint tx2)
  const lockIdx = src.indexOf('.for("update")')
  // Insert est via tx2 (savepoint) : tx.transaction((tx2) => tx2.insert(payments))
  const insertIdx = src.indexOf(".insert(payments)")
  assert.ok(lockIdx > 0, "FOR UPDATE doit exister")
  assert.ok(insertIdx > 0, ".insert(payments) doit exister")
  assert.ok(lockIdx < insertIdx, "FOR UPDATE doit précéder .insert(payments)")
})

// ─── Invariant 3 : cross-agency super_admin ───────────────────────────────────

test("MANUAL-PAYMENT-WIRING-01 : agencyId résolu depuis row.agencyId (jamais profile.agencyId) — cross-agency super_admin", () => {
  assert.match(src, /agencyId\s*=\s*row\.agencyId/)
})

test("MANUAL-PAYMENT-WIRING-01 : isSuperAdmin → agencyId:null dans withTenantContext (RLS bypass correct)", () => {
  assert.match(src, /isSuperAdmin\s*\?\s*null\s*:\s*profile\.agencyId/)
})

// ─── Invariant 4 : idempotency key ───────────────────────────────────────────

test("MANUAL-PAYMENT-WIRING-01 : idempotencyKey = `manual:${row.id}:${input.method}:${input.reference}` (format attendu)", () => {
  assert.match(
    src,
    /idempotencyKey\s*=\s*`manual:\$\{row\.id\}:\$\{input\.method\}:\$\{input\.reference\}`/,
  )
})

// ─── Invariant 5 : ALREADY_PROCESSED sur conflit unique ──────────────────────

test('MANUAL-PAYMENT-WIRING-01 : pgErrorCode "23505" → code "ALREADY_PROCESSED" (pas de throw brut sur double-clic)', () => {
  assert.match(src, /pgErrorCode\s*\(\s*err\s*\)\s*===\s*["']23505["']/)
  assert.match(src, /code:\s*["']ALREADY_PROCESSED["']/)
  // Le guard pgErrorCode("23505") doit précéder le return avec code ALREADY_PROCESSED
  // Utilise la chaîne exacte du guard (plus spécifique que juste "23505")
  const guardIdx = src.indexOf('pgErrorCode(err) === "23505"')
  const alreadyProcessedReturnIdx = src.indexOf(
    'code: "ALREADY_PROCESSED" as const',
  )
  assert.ok(guardIdx > 0, 'pgErrorCode(err) === "23505" doit exister')
  assert.ok(
    alreadyProcessedReturnIdx > 0,
    'code: "ALREADY_PROCESSED" as const doit exister',
  )
  assert.ok(
    guardIdx < alreadyProcessedReturnIdx,
    'guard "23505" doit précéder le return ALREADY_PROCESSED',
  )
})

// ─── Invariant 6 : wallet debit failure → throw (rollback) ───────────────────

test("MANUAL-PAYMENT-WIRING-01 : ManualWalletDebitFailedError throw (pas return) — rollback payments INSERT si débit échoue", () => {
  assert.match(src, /class ManualWalletDebitFailedError/)
  // throw (pas return) garantit le rollback de tx
  assert.match(src, /throw new ManualWalletDebitFailedError\s*\(/)
  assert.doesNotMatch(src, /return new ManualWalletDebitFailedError/)
})

// ─── Invariant 7 : solde restant server-side ─────────────────────────────────

test("MANUAL-PAYMENT-WIRING-01 : getReservationPaymentSummary — solde restant calculé server-side (jamais fourni par le client)", () => {
  assert.match(src, /getReservationPaymentSummary\s*\(\s*\{/)
  assert.match(src, /code:\s*["']AMOUNT_EXCEEDS_REMAINING["']/)
})

// ─── Invariant 8 : fullyPaid → status="confirmed" ────────────────────────────

test('MANUAL-PAYMENT-WIRING-01 : fullyPaid → status="confirmed" dans la transaction (acompte partiel laisse "pending")', () => {
  assert.match(src, /fullyPaid/)
  assert.match(src, /status:\s*["']confirmed["']/)
  // Le guard fullyPaid doit précéder le .set({ status: "confirmed" })
  const fullyPaidIdx = src.indexOf("if (fullyPaid)")
  const confirmedSetIdx = src.indexOf('status: "confirmed"')
  assert.ok(fullyPaidIdx > 0, "if (fullyPaid) doit exister")
  assert.ok(confirmedSetIdx > 0, 'status: "confirmed" doit exister')
  assert.ok(
    fullyPaidIdx < confirmedSetIdx,
    "if (fullyPaid) doit précéder status: confirmed",
  )
})

// ─── Invariant 9 : savepoint isolation ───────────────────────────────────────

test("MANUAL-PAYMENT-WIRING-01 : tx.transaction(tx2 => ...) — savepoint pour isoler le conflit d'idempotence sans aborter tx parente", () => {
  assert.match(src, /tx\.transaction\s*\(\s*\(tx2\)/)
})

// ─── Invariant 10 : generateInvoiceForReservation best-effort post-transaction

test("MANUAL-PAYMENT-WIRING-01 : generateInvoiceForReservation appelé uniquement quand fullyPaid (jamais pour un acompte partiel)", () => {
  assert.match(src, /generateInvoiceForReservation\s*\(\s*\{/)
  // L'appel est hors transaction (best-effort) — il doit suivre le guard fullyPaid
  const fullyPaidGuardIdx = src.indexOf(
    "if (!outcome.fullyPaid) return outcome",
  )
  const invoiceIdx = src.indexOf("generateInvoiceForReservation({")
  assert.ok(fullyPaidGuardIdx > 0, "guard fullyPaid doit exister")
  assert.ok(invoiceIdx > 0, "generateInvoiceForReservation doit exister")
  assert.ok(
    fullyPaidGuardIdx < invoiceIdx,
    "guard fullyPaid doit précéder generateInvoiceForReservation",
  )
})

test("MANUAL-PAYMENT-WIRING-01 : generateInvoiceForReservation best-effort — dans un try/catch séparé hors transaction", () => {
  // L'appel est dans un try/catch indépendant (ne bloque jamais le retour OK)
  const invoiceIdx = src.indexOf("generateInvoiceForReservation({")
  // Le try précède l'appel et le catch suit — vérification approximative via regex
  assert.match(src, /try\s*\{[\s\S]{0,200}generateInvoiceForReservation/)
})
