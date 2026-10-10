/**
 * REFUND-WIRING-01 — invariants statiques sur lib/finance/refund-actions.ts
 * (remboursement staff — admin/manager → wallet client).
 *
 * Invariants protégés :
 *
 * 1. ROLE GUARD — ALLOWED_ROLES (super_admin / manager / agent_compta) :
 *    jamais de remboursement par un rôle non autorisé (agent, receptionist…).
 *    REFUND_ALLOWED_ROLES importé depuis refund-logic (exportable sans "use
 *    server"), réutilisé ici.
 *
 * 2. FOR UPDATE lock — verrou exclusif avant toute mutation financière
 *    (applyReservationRefund) : évite le double-remboursement concurrent.
 *
 * 3. CROSS-AGENCY super_admin — agencyId utilisé pour applyReservationRefund
 *    est `reservation.agencyId` (l'agence RÉELLE de la réservation), jamais
 *    `profile.agencyId` (l'agence "domicile" du super_admin qui peut être
 *    différente). Invariant identique dans lib/admin/actions.ts.
 *
 * 4. FULLY_REFUNDED → status="refunded" — quand `fullyRefunded` est true,
 *    le statut de la réservation passe à "refunded" dans la même transaction.
 *
 * 5. HOTEL EXCLUDED FROM STOCK — releaseStock est appelé conditionnellement
 *    (CANCELLABLE_MODULES check) : hôtel exclu car sa disponibilité vit chez
 *    myGo (fournisseur externe), pas dans une table locale.
 *
 * 6. TRANSITION GUARD — isTransitionAllowed vérifié avant le remboursement
 *    total : protège contre un remboursement depuis un statut illégitime.
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(join(ROOT, "lib/finance/refund-actions.ts"), "utf8")

// ─── Invariant 1 : role guard ─────────────────────────────────────────────────

test("REFUND-WIRING-01 : REFUND_ALLOWED_ROLES importé depuis refund-logic (exportable hors use-server)", () => {
  assert.match(src, /REFUND_ALLOWED_ROLES.*from.*refund-logic/)
})

test('REFUND-WIRING-01 : role check — code "UNAUTHORIZED" retourné si rôle non autorisé', () => {
  assert.match(src, /code:\s*["']UNAUTHORIZED["']/)
})

test('REFUND-WIRING-01 : ALLOWED_ROLES inclut "super_admin", "manager", "agent_compta" (via REFUND_ALLOWED_ROLES)', () => {
  // Vérifier dans refund-logic.ts que les rôles sont définis
  const logicSrc = readFileSync(
    join(ROOT, "lib/finance/refund-logic.ts"),
    "utf8",
  )
  assert.match(logicSrc, /["']super_admin["']/)
  assert.match(logicSrc, /["']manager["']/)
  assert.match(logicSrc, /["']agent_compta["']/)
})

// ─── Invariant 2 : FOR UPDATE lock ───────────────────────────────────────────

test("REFUND-WIRING-01 : FOR UPDATE lock avant applyReservationRefund (no double-refund concurrent)", () => {
  assert.match(src, /\.for\s*\(\s*["']update["']\s*\)/)
  // Le verrou doit précéder l'appel au remboursement
  const lockIdx = src.indexOf('.for("update")')
  const refundIdx = src.indexOf("applyReservationRefund(")
  assert.ok(lockIdx > 0, "FOR UPDATE doit exister dans le fichier")
  assert.ok(
    refundIdx > 0,
    "applyReservationRefund doit exister dans le fichier",
  )
  assert.ok(
    lockIdx < refundIdx,
    "FOR UPDATE doit précéder applyReservationRefund",
  )
})

// ─── Invariant 3 : cross-agency super_admin ───────────────────────────────────

test("REFUND-WIRING-01 : agencyId = reservation.agencyId (jamais profile.agencyId) — cross-agency super_admin", () => {
  // L'agencyId passé à applyReservationRefund vient de reservation, pas du profil
  assert.match(src, /agencyId\s*=\s*reservation\.agencyId/)
})

test("REFUND-WIRING-01 : super_admin utilise agencyId:null dans le contexte tenant (RLS bypass)", () => {
  // isSuperAdmin → agencyId null dans withTenantContext
  assert.match(src, /isSuperAdmin\s*\?\s*null\s*:\s*profile\.agencyId/)
})

// ─── Invariant 4 : fullyRefunded → status="refunded" ─────────────────────────

test('REFUND-WIRING-01 : fullyRefunded → .set({ status: "refunded" }) dans la même transaction', () => {
  assert.match(src, /fullyRefunded/)
  assert.match(src, /status:\s*["']refunded["']/)
})

// ─── Invariant 5 : hotel excluded from releaseStock ──────────────────────────

test("REFUND-WIRING-01 : releaseStock conditionné par CANCELLABLE_MODULES (hôtel exclu — disponibilité myGo externe)", () => {
  assert.match(src, /CANCELLABLE_MODULES/)
  assert.match(src, /releaseStock\s*\(/)
  // Le CANCELLABLE_MODULES check doit précéder releaseStock
  const modulesIdx = src.indexOf("CANCELLABLE_MODULES")
  const releaseIdx = src.indexOf("releaseStock(")
  assert.ok(modulesIdx > 0, "CANCELLABLE_MODULES doit être importé")
  assert.ok(releaseIdx > 0, "releaseStock doit être appelé")
  assert.ok(
    modulesIdx < releaseIdx,
    "CANCELLABLE_MODULES check doit précéder releaseStock",
  )
})

// ─── Invariant 6 : transition guard ──────────────────────────────────────────

test("REFUND-WIRING-01 : isTransitionAllowed vérifié avant remboursement total (statut illégitime bloqué)", () => {
  assert.match(src, /isTransitionAllowed\s*\(/)
})
