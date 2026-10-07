/**
 * VIP-SCORE-01 — tests unitaires de `computeVipScoreCore` (fonction pure,
 * sans DB). Voir lib/crm/__tests__/vip-score-core-live.test.ts pour la
 * preuve contre un Postgres réel de `getVipScoreForLeadCore`.
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  computeVipScoreCore,
  DEFAULT_VIP_SCORE_WEIGHTS,
  type VipScoreSignals,
} from "../vip-score-core"

function baseSignals(
  overrides: Partial<VipScoreSignals> = {},
): VipScoreSignals {
  return {
    leadQualityScore: 0,
    reservationCount: 0,
    totalSalePriceTnd: 0,
    totalMarginTnd: 0,
    daysSinceLastActivity: null,
    ...overrides,
  }
}

test("computeVipScoreCore : tous les signaux à zéro => score 0, breakdown explicite à 0 partout", () => {
  const score = computeVipScoreCore(baseSignals())
  assert.equal(score.total, 0)
  assert.equal(score.breakdown.length, 5)
  for (const item of score.breakdown) {
    assert.equal(item.points, 0)
  }
})

test("computeVipScoreCore : leadQualityScore=100 contribue exactement leadQualityPointsPerUnit*100", () => {
  const score = computeVipScoreCore(baseSignals({ leadQualityScore: 100 }))
  const item = score.breakdown.find((b) => b.signal === "lead_quality")!
  assert.equal(
    item.points,
    100 * DEFAULT_VIP_SCORE_WEIGHTS.leadQualityPointsPerUnit,
  )
  assert.equal(score.total, item.points)
})

test("computeVipScoreCore : reservationCount contribue exactement pointsPerReservation par réservation", () => {
  const score = computeVipScoreCore(baseSignals({ reservationCount: 3 }))
  const item = score.breakdown.find((b) => b.signal === "recurrence")!
  assert.equal(item.points, 3 * DEFAULT_VIP_SCORE_WEIGHTS.pointsPerReservation)
  assert.equal(score.total, item.points)
})

test("computeVipScoreCore : totalSalePriceTnd contribue proportionnellement par tranche de 100 TND", () => {
  const score = computeVipScoreCore(baseSignals({ totalSalePriceTnd: 500 }))
  const item = score.breakdown.find(
    (b) => b.signal === "commercial_value_sale",
  )!
  assert.equal(
    item.points,
    (500 / 100) * DEFAULT_VIP_SCORE_WEIGHTS.pointsPer100TndSale,
  )
})

test("computeVipScoreCore : totalMarginTnd pèse plus que le CA brut équivalent (pointsPer100TndMargin > pointsPer100TndSale)", () => {
  const salesScore = computeVipScoreCore(
    baseSignals({ totalSalePriceTnd: 1000 }),
  )
  const marginScore = computeVipScoreCore(baseSignals({ totalMarginTnd: 1000 }))
  assert.ok(
    marginScore.total > salesScore.total,
    "1000 TND de marge doit valoir plus de points que 1000 TND de CA brut",
  )
})

test("computeVipScoreCore : daysSinceLastActivity=0 (activité aujourd'hui) => recencyMaxPoints plein", () => {
  const score = computeVipScoreCore(baseSignals({ daysSinceLastActivity: 0 }))
  const item = score.breakdown.find((b) => b.signal === "recency")!
  assert.equal(item.points, DEFAULT_VIP_SCORE_WEIGHTS.recencyMaxPoints)
})

test("computeVipScoreCore : daysSinceLastActivity au-delà de recencyHorizonDays => 0, jamais négatif", () => {
  const score = computeVipScoreCore(
    baseSignals({
      daysSinceLastActivity:
        DEFAULT_VIP_SCORE_WEIGHTS.recencyHorizonDays + 1000,
    }),
  )
  const item = score.breakdown.find((b) => b.signal === "recency")!
  assert.equal(item.points, 0)
})

test("computeVipScoreCore : daysSinceLastActivity=null (aucune activité connue) => recency à 0, jamais une exception", () => {
  const score = computeVipScoreCore(
    baseSignals({ daysSinceLastActivity: null }),
  )
  const item = score.breakdown.find((b) => b.signal === "recency")!
  assert.equal(item.points, 0)
  assert.equal(item.rawValue, null)
})

test("computeVipScoreCore : décroissance de la récence strictement monotone (plus récent => score égal ou supérieur)", () => {
  const recent = computeVipScoreCore(baseSignals({ daysSinceLastActivity: 10 }))
  const old = computeVipScoreCore(baseSignals({ daysSinceLastActivity: 300 }))
  const recentPoints = recent.breakdown.find(
    (b) => b.signal === "recency",
  )!.points
  const oldPoints = old.breakdown.find((b) => b.signal === "recency")!.points
  assert.ok(recentPoints > oldPoints)
})

test("computeVipScoreCore : total = somme exacte des points du breakdown (jamais un score opaque)", () => {
  const score = computeVipScoreCore(
    baseSignals({
      leadQualityScore: 75,
      reservationCount: 2,
      totalSalePriceTnd: 1200,
      totalMarginTnd: 300,
      daysSinceLastActivity: 15,
    }),
  )
  const sumOfBreakdown = score.breakdown.reduce(
    (sum, item) => sum + item.points,
    0,
  )
  assert.equal(score.total, Math.round(sumOfBreakdown * 100) / 100)
})

test("computeVipScoreCore : reproductible — mêmes signaux => même score, toujours", () => {
  const signals = baseSignals({
    leadQualityScore: 50,
    reservationCount: 5,
    totalSalePriceTnd: 3000,
    totalMarginTnd: 900,
    daysSinceLastActivity: 40,
  })
  const a = computeVipScoreCore(signals)
  const b = computeVipScoreCore(signals)
  assert.deepEqual(a, b)
})

test("computeVipScoreCore : poids personnalisés respectés (pas seulement les défauts)", () => {
  const customWeights = {
    ...DEFAULT_VIP_SCORE_WEIGHTS,
    pointsPerReservation: 50,
  }
  const score = computeVipScoreCore(
    baseSignals({ reservationCount: 2 }),
    customWeights,
  )
  const item = score.breakdown.find((b) => b.signal === "recurrence")!
  assert.equal(item.points, 100)
})
