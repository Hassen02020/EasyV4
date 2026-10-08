/**
 * PROMO-01 — tests unitaires de resolveApplicableDiscountCore (fonction
 * pure, aucun accès DB requis).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { resolveApplicableDiscountCore } from "../promo-core"

test("aucune borne (validFrom/validTo null) → toujours applicable", () => {
  const result = resolveApplicableDiscountCore(
    {
      discountType: "percent",
      discountValue: "10.00",
      validFrom: null,
      validTo: null,
      allowBelowCost: false,
    },
    new Date("2026-11-15T00:00:00Z"),
  )
  assert.deepEqual(result, {
    applicable: true,
    discountType: "percent",
    discountValue: "10.00",
    allowBelowCost: false,
  })
})

test("avant validFrom → NOT_YET_VALID", () => {
  const result = resolveApplicableDiscountCore(
    {
      discountType: "fixed",
      discountValue: "50.00",
      validFrom: new Date("2026-11-01T00:00:00Z"),
      validTo: null,
      allowBelowCost: false,
    },
    new Date("2026-10-15T00:00:00Z"),
  )
  assert.deepEqual(result, { applicable: false, reason: "NOT_YET_VALID" })
})

test("après validTo → EXPIRED", () => {
  const result = resolveApplicableDiscountCore(
    {
      discountType: "fixed",
      discountValue: "50.00",
      validFrom: null,
      validTo: new Date("2026-11-30T00:00:00Z"),
      allowBelowCost: false,
    },
    new Date("2026-12-01T00:00:00Z"),
  )
  assert.deepEqual(result, { applicable: false, reason: "EXPIRED" })
})

test("exactement à la borne validFrom → applicable (inclusif)", () => {
  const boundary = new Date("2026-11-01T00:00:00Z")
  const result = resolveApplicableDiscountCore(
    {
      discountType: "percent",
      discountValue: "20.00",
      validFrom: boundary,
      validTo: null,
      allowBelowCost: false,
    },
    boundary,
  )
  assert.equal(result.applicable, true)
})

test("exactement à la borne validTo → applicable (inclusif)", () => {
  const boundary = new Date("2026-11-30T00:00:00Z")
  const result = resolveApplicableDiscountCore(
    {
      discountType: "percent",
      discountValue: "20.00",
      validFrom: null,
      validTo: boundary,
      allowBelowCost: false,
    },
    boundary,
  )
  assert.equal(result.applicable, true)
})

test("dans la fenêtre [validFrom, validTo] → applicable", () => {
  const result = resolveApplicableDiscountCore(
    {
      discountType: "fixed",
      discountValue: "50.00",
      validFrom: new Date("2026-11-01T00:00:00Z"),
      validTo: new Date("2026-11-30T00:00:00Z"),
      allowBelowCost: false,
    },
    new Date("2026-11-15T00:00:00Z"),
  )
  assert.equal(result.applicable, true)
})

test("allowBelowCost: true est propagé tel quel dans le résultat applicable", () => {
  const result = resolveApplicableDiscountCore(
    {
      discountType: "percent",
      discountValue: "30.00",
      validFrom: null,
      validTo: null,
      allowBelowCost: true,
    },
    new Date("2026-11-15T00:00:00Z"),
  )
  assert.equal(result.applicable, true)
  if (result.applicable) assert.equal(result.allowBelowCost, true)
})
