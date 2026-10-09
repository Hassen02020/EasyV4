/**
 * COMMISSION-WIRING-B2B-01/transfers — invariants statiques sur le câblage
 * financier du module Transferts B2B (actions.ts).
 *
 * Invariants protégés (symétrique à commission-wiring.test.ts B2C) :
 *
 * 1. SÉPARATION supplier_cost / sale_price — coût fournisseur =
 *    basePriceTnd + nightSurchargeAmount (≠ totalTnd).
 *
 * 2. commissionAmount destructuré depuis recordReservationFinancials (jamais
 *    recalculé).
 *
 * 3. DEUX ENTITLEMENTS — product_owner/supplier_cost + seller/seller_margin.
 *    seller_margin = pricing.totalTnd - transferSupplierCostTnd.
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
const src = readFileSync(join(ROOT, "lib/transfers/actions.ts"), "utf8")

// ─── Invariant 1 : supplier cost ≠ sale price ─────────────────────────────

test("COMMISSION-WIRING-B2B-01/transfers : transferSupplierCostTnd = basePriceTnd + nightSurchargeAmount (B2B)", () => {
  assert.match(
    src,
    /transferSupplierCostTnd\s*=\s*pricing\.basePriceTnd\s*\+\s*pricing\.nightSurchargeAmount/,
  )
})

test("COMMISSION-WIRING-B2B-01/transfers : supplierPriceTnd passe transferSupplierCostTnd (B2B)", () => {
  assert.match(src, /supplierPriceTnd:\s*transferSupplierCostTnd/)
})

test("COMMISSION-WIRING-B2B-01/transfers : salePriceTnd passe pricing.totalTnd (distinct du coût, B2B)", () => {
  assert.match(src, /salePriceTnd:\s*pricing\.totalTnd/)
})

// ─── Invariant 2 : commissionAmount depuis recordReservationFinancials ────

test("COMMISSION-WIRING-B2B-01/transfers : commissionAmount destructuré depuis recordReservationFinancials (B2B)", () => {
  assert.match(
    src,
    /const\s*\{[^}]*commissionAmount[^}]*\}\s*=\s*await\s+recordReservationFinancials\(/,
  )
})

test("COMMISSION-WIRING-B2B-01/transfers : creditPlatformCommission appelé avec commissionAmount (B2B)", () => {
  assert.match(
    src,
    /await creditPlatformCommission\(tx,\s*\{[\s\S]*?commissionAmount,/,
  )
})

test("COMMISSION-WIRING-B2B-01/transfers : creditPlatformCommission description contient publicRef (B2B)", () => {
  assert.match(src, /description:\s*`[^`]*publicRef[^`]*`/)
})

// ─── Invariant 3 : deux entitlements économiques ──────────────────────────

test("COMMISSION-WIRING-B2B-01/transfers : entitlement product_owner avec qualification supplier_cost (B2B)", () => {
  assert.match(src, /role:\s*"product_owner"/)
  assert.match(src, /qualification:\s*"supplier_cost"/)
})

test("COMMISSION-WIRING-B2B-01/transfers : entitlement seller avec qualification seller_margin (B2B)", () => {
  assert.match(src, /role:\s*"seller"/)
  assert.match(src, /qualification:\s*"seller_margin"/)
})

test("COMMISSION-WIRING-B2B-01/transfers : seller_margin = pricing.totalTnd - transferSupplierCostTnd (B2B)", () => {
  assert.match(
    src,
    /amount:\s*pricing\.totalTnd\s*-\s*transferSupplierCostTnd/,
  )
})

// ─── Invariant 4 : imports corrects ───────────────────────────────────────

test("COMMISSION-WIRING-B2B-01/transfers : imports creditPlatformCommission et recordReservationFinancials (B2B)", () => {
  assert.match(src, /import.*creditPlatformCommission.*from.*platform-commission/)
  assert.match(
    src,
    /import.*recordReservationFinancials.*from.*reservation-financials/,
  )
})
