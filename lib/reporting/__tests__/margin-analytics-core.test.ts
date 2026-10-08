/**
 * REVENUE-CONSOLIDATE-01 — tests unitaires PURS pour
 * `sumRevenueMarginCore` (lib/reporting/margin-analytics-core.ts),
 * la primitive partagée extraite pour remplacer les paires de
 * `.reduce()` dupliquées dans `campaign-performance-core.ts` et
 * `vip-score-core.ts`. Aucun accès DB — fonction pure, testable en
 * isolation.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { sumRevenueMarginCore } from "../margin-analytics-core"

test("sumRevenueMarginCore : tableau vide → 0/0", () => {
  const result = sumRevenueMarginCore([])
  assert.equal(result.revenueTnd, 0)
  assert.equal(result.marginTnd, 0)
})

test("sumRevenueMarginCore : somme plusieurs lignes, valeurs string (format DB decimal)", () => {
  const result = sumRevenueMarginCore([
    { salePriceTnd: "100.00", marginAmount: "20.00" },
    { salePriceTnd: "250.50", marginAmount: "45.50" },
    { salePriceTnd: "10.00", marginAmount: "2.00" },
  ])
  assert.equal(result.revenueTnd, 360.5)
  assert.equal(result.marginTnd, 67.5)
})

test("sumRevenueMarginCore : accepte aussi des valeurs number", () => {
  const result = sumRevenueMarginCore([
    { salePriceTnd: 100, marginAmount: 20 },
    { salePriceTnd: 50, marginAmount: 5 },
  ])
  assert.equal(result.revenueTnd, 150)
  assert.equal(result.marginTnd, 25)
})

test("sumRevenueMarginCore : une seule ligne", () => {
  const result = sumRevenueMarginCore([
    { salePriceTnd: "42.42", marginAmount: "7.77" },
  ])
  assert.equal(result.revenueTnd, 42.42)
  assert.equal(result.marginTnd, 7.77)
})

test("sumRevenueMarginCore : ignore les champs additionnels présents sur chaque ligne (ex. createdAt)", () => {
  const result = sumRevenueMarginCore([
    {
      salePriceTnd: "100.00",
      marginAmount: "20.00",
      createdAt: new Date(),
    } as unknown as { salePriceTnd: string; marginAmount: string },
  ])
  assert.equal(result.revenueTnd, 100)
  assert.equal(result.marginTnd, 20)
})

test("sumRevenueMarginCore : marge négative (vente sous coût) sommée telle quelle, jamais flooré à 0", () => {
  const result = sumRevenueMarginCore([
    { salePriceTnd: "50.00", marginAmount: "-10.00" },
  ])
  assert.equal(result.revenueTnd, 50)
  assert.equal(result.marginTnd, -10)
})
