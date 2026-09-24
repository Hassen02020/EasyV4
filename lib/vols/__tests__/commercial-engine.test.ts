/**
 * Pure unit tests for applyCommercialEngine.
 * No DB, no server-only imports.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { applyCommercialEngine } from "@/lib/vols/commercial-engine"

const AGENCY = "00000000-0000-0000-0000-000000000001"

test("B2C: sellingAmount = supplierAmount + fee + markup", async () => {
  // Default env: fixedFee=15, markupRate=0.04
  const result = await applyCommercialEngine(1000, "TND", AGENCY, "B2C")
  assert.equal(result.supplierAmount, 1000)
  assert.equal(result.fee, 15)
  assert.equal(result.markup, 40)            // 1000 * 0.04
  assert.equal(result.sellingAmount, 1055)   // 1000+15+40
  assert.equal(result.sellingCurrency, "TND")
})

test("B2C: amounts rounded to 3 decimal places", async () => {
  const result = await applyCommercialEngine(333.333, "TND", AGENCY, "B2C")
  // markup = 333.333 * 0.04 = 13.33332 → 13.333
  assert.equal(result.markup, 13.333)
  // sellingAmount = 333.333 + 15 + 13.333 = 361.666
  assert.equal(result.sellingAmount, 361.666)
})

test("B2B: lower fee and markup than B2C", async () => {
  const b2c = await applyCommercialEngine(1000, "TND", AGENCY, "B2C")
  const b2b = await applyCommercialEngine(1000, "TND", AGENCY, "B2B")
  assert.ok(b2b.sellingAmount < b2c.sellingAmount, "B2B selling price < B2C")
})

test("PARTNER: lower fee than B2B", async () => {
  const b2b = await applyCommercialEngine(1000, "TND", AGENCY, "B2B")
  const partner = await applyCommercialEngine(1000, "TND", AGENCY, "PARTNER")
  assert.ok(partner.sellingAmount < b2b.sellingAmount, "PARTNER selling price < B2B")
})

test("WHITE_LABEL: zero fixed fee", async () => {
  const wl = await applyCommercialEngine(1000, "TND", AGENCY, "WHITE_LABEL")
  assert.equal(wl.fee, 0)
})

test("supplierAmount preserved exactly", async () => {
  const result = await applyCommercialEngine(599.9, "TND", AGENCY, "B2C")
  assert.equal(result.supplierAmount, 599.9)
  assert.equal(result.supplierCurrency, "TND")
})

test("zero supplier price: only fee charged", async () => {
  const result = await applyCommercialEngine(0, "TND", AGENCY, "B2C")
  assert.equal(result.markup, 0)
  assert.equal(result.sellingAmount, result.fee)
})
