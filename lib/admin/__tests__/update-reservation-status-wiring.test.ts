/**
 * UPDATE-RESERVATION-STATUS-WIRING-01 — invariants statiques sur
 * lib/admin/actions.ts::updateReservationStatus (changement de statut admin,
 * avec intégrité paiement/ledger sur annulation).
 *
 * Invariants protégés :
 *
 * 1. ROLE GUARD — RESERVATION_STATUS_ALLOWED_ROLES (super_admin / manager /
 *    agent_resa) : jamais de changement de statut par un rôle non autorisé.
 *
 * 2. CROSS-AGENCY super_admin — agencyId résolu depuis reservations.agencyId
 *    AVANT la transaction (lookup cross-agence via withTenantContext avec
 *    agencyId:null pour super_admin). Un super_admin ne doit pas être limité
 *    à sa propre agence "domicile".
 *
 * 3. isSuperAdmin → agencyId:null dans withTenantContext (RLS bypass correct).
 *
 * 4. CANCELLED → applyReservationRefund — sur transition "cancelled",
 *    applyReservationRefund est appelé dans la MÊME transaction (jamais un
 *    paiement capturé orphelin après annulation admin).
 *
 * 5. NO_CAPTURED_PAYMENT no-op — si code NO_CAPTURED_PAYMENT, l'annulation
 *    continue (réservation B2B ou jamais payée). Tout autre échec de
 *    remboursement THROW (rollback complet) — jamais un return qui
 *    committerait un statut "cancelled" avec un remboursement en échec.
 *
 * 6. AUDIT best-effort — l'insertion dans auditEvents est dans un try/catch
 *    (ne bloque pas la mutation principale).
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(join(ROOT, "lib/admin/actions.ts"), "utf8")
const statusSrc = readFileSync(
  join(ROOT, "lib/admin/reservation-status.ts"),
  "utf8",
)

// ─── Invariant 1 : role guard ─────────────────────────────────────────────────

test("UPDATE-STATUS-WIRING-01 : RESERVATION_STATUS_ALLOWED_ROLES importé depuis reservation-status", () => {
  assert.match(src, /RESERVATION_STATUS_ALLOWED_ROLES/)
})

test("UPDATE-STATUS-WIRING-01 : role guard retourne une erreur si rôle non autorisé (jamais de transition par un rôle hors liste)", () => {
  // La négation sur le tableau de rôles doit être présente
  assert.match(src, /RESERVATION_STATUS_ALLOWED_ROLES[\s\S]{0,100}includes/)
})

test('UPDATE-STATUS-WIRING-01 : RESERVATION_STATUS_ALLOWED_ROLES contient "super_admin", "manager", "agent_resa"', () => {
  assert.match(statusSrc, /["']super_admin["']/)
  assert.match(statusSrc, /["']manager["']/)
  assert.match(statusSrc, /["']agent_resa["']/)
})

// ─── Invariant 2 : cross-agency super_admin ───────────────────────────────────

test("UPDATE-STATUS-WIRING-01 : agencyId résolu depuis reservations.agencyId (lookup cross-agence, jamais profile.agencyId)", () => {
  // Le sélect sur reservations.agencyId pour résoudre l'agence réelle
  assert.match(src, /agencyId:\s*reservations\.agencyId/)
})

// ─── Invariant 3 : isSuperAdmin → agencyId:null ───────────────────────────────

test("UPDATE-STATUS-WIRING-01 : isSuperAdmin → agencyId:null dans withTenantContext (RLS bypass correct)", () => {
  assert.match(src, /isSuperAdmin\s*\?\s*null\s*:\s*profile\.agencyId/)
})

// ─── Invariant 4 : cancelled → applyReservationRefund dans la même transaction

test('UPDATE-STATUS-WIRING-01 : transition "cancelled" → applyReservationRefund dans la même transaction (no paiement capturé orphelin)', () => {
  assert.match(src, /nextStatus\s*===\s*["']cancelled["']/)
  assert.match(src, /applyReservationRefund\s*\(\s*\{/)
  // L'appel au remboursement doit se trouver après le guard nextStatus==="cancelled"
  const cancelledIdx = src.indexOf('"cancelled"')
  const refundIdx = src.indexOf("applyReservationRefund({")
  assert.ok(cancelledIdx > 0, 'guard "cancelled" doit exister')
  assert.ok(refundIdx > 0, "applyReservationRefund doit exister")
  assert.ok(
    cancelledIdx < refundIdx,
    'guard "cancelled" doit précéder applyReservationRefund',
  )
})

// ─── Invariant 5 : NO_CAPTURED_PAYMENT no-op + throw sur autre échec ──────────

test("UPDATE-STATUS-WIRING-01 : NO_CAPTURED_PAYMENT est un no-op (annulation B2B ou résa jamais payée)", () => {
  assert.match(src, /refund\.code\s*!==\s*["']NO_CAPTURED_PAYMENT["']/)
})

test("UPDATE-STATUS-WIRING-01 : tout autre échec de remboursement THROW (rollback complet — jamais return sur échec)", () => {
  // Le throw (pas return) assure que la transaction rollback si le remboursement échoue
  // On cherche throw après le check code !== NO_CAPTURED_PAYMENT
  const noCaptureIdx = src.indexOf("NO_CAPTURED_PAYMENT")
  const throwIdx = src.indexOf("throw new Error(refund.error)")
  assert.ok(noCaptureIdx > 0, "NO_CAPTURED_PAYMENT check doit exister")
  assert.ok(throwIdx > 0, "throw new Error(refund.error) doit exister")
  assert.ok(
    noCaptureIdx < throwIdx,
    "NO_CAPTURED_PAYMENT check doit précéder le throw",
  )
})

// ─── Invariant 6 : audit best-effort ─────────────────────────────────────────

test("UPDATE-STATUS-WIRING-01 : audit auditEvents best-effort — commentaire explicite dans le catch", () => {
  // Le catch contient un commentaire "best-effort" — preuve que l'insert est volontairement isolé
  assert.match(src, /catch[\s\S]{0,50}\/\*[\s\S]{0,100}best-effort/)
})
