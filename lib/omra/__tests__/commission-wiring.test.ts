/**
 * COMMISSION-WIRING-COVERAGE-01 — invariants statiques sur le câblage
 * financier du module Omra B2C (guest-booking-actions.ts).
 *
 * Invariants protégés :
 *
 * 1. CATALOGUE PROPRE — Omra est un catalogue de l'agence, sans fournisseur
 *    externe modélisé. Par conséquent, `supplierPriceTnd === salePriceTnd ===
 *    totalTnd`. C'est intentionnel (R6-02, ECON-WIRING-01) : aucun "coût net
 *    fournisseur" séparé n'existe pour ce module.
 *
 * 2. UN SEUL ENTITLEMENT — product_owner/owner_share (pas de seller_margin
 *    ni de commission fabriquée à 0).
 *
 * 3. commissionAmount correctement destructuré et passé à
 *    creditPlatformCommission.
 *
 * Pattern readFileSync (même discipline que lib/cars/__tests__/
 * reservation-financials-wiring.test.ts).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/omra/guest-booking-actions.ts"),
  "utf8",
)

// ─── Invariant 1 : catalogue propre (pas de coût fournisseur séparé) ──────

test("COMMISSION-WIRING-COVERAGE-01/omra : supplierPriceTnd = totalTnd (catalogue propre, pas de fournisseur externe)", () => {
  assert.match(src, /supplierPriceTnd:\s*totalTnd,/)
})

test("COMMISSION-WIRING-COVERAGE-01/omra : salePriceTnd = totalTnd (identique au coût, pas de marge distincte)", () => {
  assert.match(src, /salePriceTnd:\s*totalTnd,/)
})

// ─── Invariant 2 : entitlement unique owner_share ─────────────────────────

test("COMMISSION-WIRING-COVERAGE-01/omra : entitlement product_owner avec qualification owner_share", () => {
  assert.match(src, /role:\s*"product_owner"/)
  assert.match(src, /qualification:\s*"owner_share"/)
})

// ─── Invariant 3 : commissionAmount depuis recordReservationFinancials ────

test("COMMISSION-WIRING-COVERAGE-01/omra : commissionAmount destructuré depuis recordReservationFinancials", () => {
  assert.match(
    src,
    /const\s*\{[^}]*commissionAmount[^}]*\}\s*=\s*await\s+recordReservationFinancials\(/,
  )
})

test("COMMISSION-WIRING-COVERAGE-01/omra : creditPlatformCommission appelé avec commissionAmount issu de recordReservationFinancials", () => {
  assert.match(
    src,
    /await creditPlatformCommission\(tx,\s*\{[\s\S]*?commissionAmount,/,
  )
})

test("COMMISSION-WIRING-COVERAGE-01/omra : creditPlatformCommission contient description avec publicRef", () => {
  assert.match(src, /description:\s*`[^`]*publicRef[^`]*`/)
})

// ─── Invariant 4 : imports corrects ───────────────────────────────────────

test("COMMISSION-WIRING-COVERAGE-01/omra : creditPlatformCommission et recordReservationFinancials sont importés", () => {
  assert.match(
    src,
    /import.*creditPlatformCommission.*from.*platform-commission/,
  )
  assert.match(
    src,
    /import.*recordReservationFinancials.*from.*reservation-financials/,
  )
})
