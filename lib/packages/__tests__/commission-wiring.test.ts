/**
 * COMMISSION-WIRING-COVERAGE-01 — invariants statiques sur le câblage
 * financier du module Packages B2C (booking-actions.ts).
 *
 * Invariants protégés :
 *
 * 1. CATALOGUE PROPRE — les voyages organisés (packages) sont un catalogue
 *    de l'agence, sans fournisseur externe modélisé. `supplierPriceTnd ===
 *    salePriceTnd === totalTnd`. Intentionnel (R6-02, ECON-WIRING-01).
 *
 * 2. UN SEUL ENTITLEMENT — product_owner/owner_share dans le chemin B2C
 *    createGuestPackageBooking.
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
const src = readFileSync(join(ROOT, "lib/packages/booking-actions.ts"), "utf8")

// ─── Invariant 1 : catalogue propre (pas de coût fournisseur séparé) ──────

test("COMMISSION-WIRING-COVERAGE-01/packages : supplierPriceTnd = totalTnd (catalogue propre, pas de fournisseur externe)", () => {
  assert.match(src, /supplierPriceTnd:\s*totalTnd,/)
})

test("COMMISSION-WIRING-COVERAGE-01/packages : salePriceTnd = totalTnd (identique au coût, pas de marge distincte)", () => {
  assert.match(src, /salePriceTnd:\s*totalTnd,/)
})

// ─── Invariant 2 : entitlement unique owner_share ─────────────────────────

test("COMMISSION-WIRING-COVERAGE-01/packages : entitlement product_owner avec qualification owner_share", () => {
  assert.match(src, /role:\s*"product_owner"/)
  assert.match(src, /qualification:\s*"owner_share"/)
})

// ─── Invariant 3 : commissionAmount depuis recordReservationFinancials ────

test("COMMISSION-WIRING-COVERAGE-01/packages : commissionAmount destructuré depuis recordReservationFinancials", () => {
  assert.match(
    src,
    /const\s*\{[^}]*commissionAmount[^}]*\}\s*=\s*await\s+recordReservationFinancials\(/,
  )
})

test("COMMISSION-WIRING-COVERAGE-01/packages : creditPlatformCommission appelé avec commissionAmount issu de recordReservationFinancials", () => {
  assert.match(
    src,
    /await creditPlatformCommission\(tx,\s*\{[\s\S]*?commissionAmount,/,
  )
})

test("COMMISSION-WIRING-COVERAGE-01/packages : creditPlatformCommission contient description avec publicRef", () => {
  assert.match(src, /description:\s*`[^`]*publicRef[^`]*`/)
})

// ─── Invariant 4 : imports corrects ───────────────────────────────────────

test("COMMISSION-WIRING-COVERAGE-01/packages : creditPlatformCommission et recordReservationFinancials sont importés", () => {
  assert.match(
    src,
    /import.*creditPlatformCommission.*from.*platform-commission/,
  )
  assert.match(
    src,
    /import.*recordReservationFinancials.*from.*reservation-financials/,
  )
})
