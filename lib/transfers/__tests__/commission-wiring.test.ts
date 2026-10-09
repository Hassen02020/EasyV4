/**
 * COMMISSION-WIRING-COVERAGE-01 — invariants statiques sur le câblage
 * financier du module Transferts B2C (guest-booking-actions.ts).
 *
 * Invariants protégés :
 *
 * 1. SÉPARATION supplier_cost / sale_price — les transferts ont un coût
 *    fournisseur structuré (basePriceTnd + nightSurchargeAmount), distinct
 *    du prix de vente final (totalTnd après remise éventuelle). Ce n'est
 *    PAS un catalogue supplierPriceTnd === salePriceTnd.
 *
 * 2. COMMISSION CORRECTE — `commissionAmount` destructuré depuis
 *    `recordReservationFinancials`, jamais recalculé.
 *
 * 3. DEUX ENTITLEMENTS — product_owner/supplier_cost + seller/seller_margin.
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
const src = readFileSync(
  join(ROOT, "lib/transfers/guest-booking-actions.ts"),
  "utf8",
)

// ─── Invariant 1 : supplier cost ≠ sale price ─────────────────────────────

test("COMMISSION-WIRING-COVERAGE-01/transfers : supplierPriceTnd = base + majoration nuit (pas totalTnd)", () => {
  // Le coût réel d'un transfert = base du catalogue + surcharge nuit.
  // Ne doit JAMAIS être confondu avec le prix de vente final (totalTnd).
  assert.match(
    src,
    /transferSupplierCostTnd\s*=\s*pricing\.basePriceTnd\s*\+\s*pricing\.nightSurchargeAmount/,
  )
})

test("COMMISSION-WIRING-COVERAGE-01/transfers : supplierPriceTnd passe transferSupplierCostTnd dans recordReservationFinancials", () => {
  assert.match(src, /supplierPriceTnd:\s*transferSupplierCostTnd/)
})

test("COMMISSION-WIRING-COVERAGE-01/transfers : salePriceTnd passe totalTnd (distinct du coût fournisseur)", () => {
  assert.match(src, /salePriceTnd:\s*totalTnd/)
})

// ─── Invariant 2 : commissionAmount depuis recordReservationFinancials ────

test("COMMISSION-WIRING-COVERAGE-01/transfers : commissionAmount destructuré depuis recordReservationFinancials", () => {
  assert.match(
    src,
    /const\s*\{[^}]*commissionAmount[^}]*\}\s*=\s*await\s+recordReservationFinancials\(/,
  )
})

test("COMMISSION-WIRING-COVERAGE-01/transfers : creditPlatformCommission appelé avec commissionAmount issu de recordReservationFinancials", () => {
  assert.match(
    src,
    /await creditPlatformCommission\(tx,\s*\{[\s\S]*?commissionAmount,/,
  )
})

test("COMMISSION-WIRING-COVERAGE-01/transfers : creditPlatformCommission contient description avec publicRef", () => {
  assert.match(src, /description:\s*`[^`]*publicRef[^`]*`/)
})

// ─── Invariant 3 : deux entitlements économiques ──────────────────────────

test("COMMISSION-WIRING-COVERAGE-01/transfers : entitlement product_owner avec qualification supplier_cost", () => {
  assert.match(src, /role:\s*"product_owner"/)
  assert.match(src, /qualification:\s*"supplier_cost"/)
})

test("COMMISSION-WIRING-COVERAGE-01/transfers : entitlement seller avec qualification seller_margin", () => {
  assert.match(src, /role:\s*"seller"/)
  assert.match(src, /qualification:\s*"seller_margin"/)
})

test("COMMISSION-WIRING-COVERAGE-01/transfers : seller_margin = totalTnd - transferSupplierCostTnd", () => {
  // La marge du vendeur est la différence entre prix de vente et coût réel.
  assert.match(
    src,
    /amount:\s*totalTnd\s*-\s*transferSupplierCostTnd/,
  )
})

// ─── Invariant 4 : imports corrects ───────────────────────────────────────

test("COMMISSION-WIRING-COVERAGE-01/transfers : creditPlatformCommission et recordReservationFinancials sont importés", () => {
  assert.match(src, /import.*creditPlatformCommission.*from.*platform-commission/)
  assert.match(
    src,
    /import.*recordReservationFinancials.*from.*reservation-financials/,
  )
})
