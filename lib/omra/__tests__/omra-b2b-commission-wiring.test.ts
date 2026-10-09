/**
 * COMMISSION-WIRING-B2B-01/omra — invariants statiques sur le câblage
 * financier du module Omra B2B (booking-actions.ts).
 *
 * Invariants protégés (symétrique à commission-wiring.test.ts B2C) :
 *
 * 1. CATALOGUE PROPRE — supplierPriceTnd === salePriceTnd === totalTnd
 *    (intentionnel R6-02 : aucun fournisseur externe modélisé pour Omra B2B).
 *
 * 2. UN SEUL ENTITLEMENT — product_owner/owner_share.
 *
 * 3. commissionAmount destructuré depuis recordReservationFinancials.
 *
 * 4. creditPlatformCommission câblé correctement.
 *
 * Pattern readFileSync (même discipline que lib/cars/__tests__/
 * reservation-financials-wiring.test.ts).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(join(ROOT, "lib/omra/booking-actions.ts"), "utf8")

// ─── Invariant 1 : catalogue propre (pas de coût fournisseur séparé) ──────

test("COMMISSION-WIRING-B2B-01/omra : supplierPriceTnd = totalTnd (catalogue propre B2B)", () => {
  assert.match(src, /supplierPriceTnd:\s*totalTnd,/)
})

test("COMMISSION-WIRING-B2B-01/omra : salePriceTnd = totalTnd (catalogue propre B2B)", () => {
  assert.match(src, /salePriceTnd:\s*totalTnd,/)
})

// ─── Invariant 2 : entitlement unique owner_share ─────────────────────────

test("COMMISSION-WIRING-B2B-01/omra : entitlement product_owner avec qualification owner_share (B2B)", () => {
  assert.match(src, /role:\s*"product_owner"/)
  assert.match(src, /qualification:\s*"owner_share"/)
})

// ─── Invariant 3 : commissionAmount depuis recordReservationFinancials ────

test("COMMISSION-WIRING-B2B-01/omra : commissionAmount destructuré depuis recordReservationFinancials (B2B)", () => {
  assert.match(
    src,
    /const\s*\{[^}]*commissionAmount[^}]*\}\s*=\s*await\s+recordReservationFinancials\(/,
  )
})

test("COMMISSION-WIRING-B2B-01/omra : creditPlatformCommission appelé avec commissionAmount (B2B)", () => {
  assert.match(
    src,
    /await creditPlatformCommission\(tx,\s*\{[\s\S]*?commissionAmount,/,
  )
})

test("COMMISSION-WIRING-B2B-01/omra : creditPlatformCommission description contient publicRef (B2B)", () => {
  assert.match(src, /description:\s*`[^`]*publicRef[^`]*`/)
})

// ─── Invariant 4 : imports corrects ───────────────────────────────────────

test("COMMISSION-WIRING-B2B-01/omra : imports creditPlatformCommission et recordReservationFinancials (B2B)", () => {
  assert.match(src, /import.*creditPlatformCommission.*from.*platform-commission/)
  assert.match(
    src,
    /import.*recordReservationFinancials.*from.*reservation-financials/,
  )
})
