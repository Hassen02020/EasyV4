/**
 * PRICING-PROMO-LINK-01 — tests unitaires de applyPromoDiscountCore
 * (fonction pure, aucun accès DB requis).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { applyPromoDiscountCore } from "../promo-discount-core"

test("remise non applicable → prix inchangé, arrondi à 2 décimales", () => {
  const result = applyPromoDiscountCore(120.456, {
    applicable: false,
    reason: "EXPIRED",
  })
  assert.deepEqual(result, {
    finalPriceTnd: 120.46,
    discountApplied: false,
    reason: "NOT_APPLICABLE",
  })
})

test("remise percent, sans coût fournisseur (omra/package/activity/car) → appliquée sans plancher", () => {
  const result = applyPromoDiscountCore(120, {
    applicable: true,
    discountType: "percent",
    discountValue: "30.00",
    allowBelowCost: false,
  })
  assert.deepEqual(result, { finalPriceTnd: 84, discountApplied: true })
})

test("remise fixed, sans coût fournisseur → soustraction simple", () => {
  const result = applyPromoDiscountCore(120, {
    applicable: true,
    discountType: "fixed",
    discountValue: "50.00",
    allowBelowCost: false,
  })
  assert.deepEqual(result, { finalPriceTnd: 70, discountApplied: true })
})

test("remise > prix → plancher à 0, jamais un prix négatif", () => {
  const result = applyPromoDiscountCore(30, {
    applicable: true,
    discountType: "fixed",
    discountValue: "50.00",
    allowBelowCost: false,
  })
  assert.deepEqual(result, { finalPriceTnd: 0, discountApplied: true })
})

test("avec coût fournisseur, allowBelowCost=false → plafonné au coût fournisseur (politique C)", () => {
  // supplierPrice=100, salePrice=120, remise -30% → 84 théorique, plancher à 100.
  const result = applyPromoDiscountCore(
    120,
    {
      applicable: true,
      discountType: "percent",
      discountValue: "30.00",
      allowBelowCost: false,
    },
    { supplierPriceTnd: 100 },
  )
  assert.deepEqual(result, { finalPriceTnd: 100, discountApplied: true })
})

test("avec coût fournisseur, allowBelowCost=true → vente à perte autorisée explicitement", () => {
  const result = applyPromoDiscountCore(
    120,
    {
      applicable: true,
      discountType: "percent",
      discountValue: "30.00",
      allowBelowCost: true,
    },
    { supplierPriceTnd: 100 },
  )
  assert.deepEqual(result, { finalPriceTnd: 84, discountApplied: true })
})

test("avec coût fournisseur, remise qui reste au-dessus → pas de plancher déclenché", () => {
  const result = applyPromoDiscountCore(
    120,
    {
      applicable: true,
      discountType: "fixed",
      discountValue: "10.00",
      allowBelowCost: false,
    },
    { supplierPriceTnd: 100 },
  )
  assert.deepEqual(result, { finalPriceTnd: 110, discountApplied: true })
})

test("supplierPriceTnd omis (omra/package/activity/car) → jamais de plancher, même avec allowBelowCost=false", () => {
  const result = applyPromoDiscountCore(50, {
    applicable: true,
    discountType: "percent",
    discountValue: "90.00",
    allowBelowCost: false,
  })
  assert.deepEqual(result, { finalPriceTnd: 5, discountApplied: true })
})

test("arrondi à 2 décimales (pas 3 comme applyMargin — niveau réellement persisté)", () => {
  const result = applyPromoDiscountCore(99.995, {
    applicable: true,
    discountType: "fixed",
    discountValue: "0",
    allowBelowCost: false,
  })
  assert.equal(result.finalPriceTnd, 100)
})
