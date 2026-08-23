import test from "node:test"
import assert from "node:assert/strict"
import { scoreOffer, rankOffers } from "../core/ranking"
import type { NormalizedRate } from "../core/types"

function rate(overrides: Partial<NormalizedRate>): NormalizedRate {
  return {
    hotelId: "h1",
    supplier: "mygo",
    supplierHotelCode: "h1",
    supplierRateCode: "r1",
    roomId: "r1",
    roomName: "Double",
    occupancy: { adults: 2 },
    currency: "TND",
    netPrice: 400,
    sellingPrice: 420,
    cancellationPolicy: { type: "FREE_CANCELLATION" },
    refundable: true,
    availability: "AVAILABLE",
    ...overrides,
  }
}

test("rankOffers LOWEST_PRICE : trie strictement par prix de vente croissant", () => {
  const rates = [rate({ supplier: "mygo", sellingPrice: 420 }), rate({ supplier: "cyberesa", sellingPrice: 405 }), rate({ supplier: "3t", sellingPrice: 430 })]
  const ranked = rankOffers(rates, { strategy: "LOWEST_PRICE" })
  assert.deepEqual(ranked.map((r) => r.sellingPrice), [405, 420, 430])
})

test("rankOffers BEST_MARGIN : favorise la marge (sellingPrice - netPrice) la plus haute", () => {
  const rates = [
    rate({ supplier: "mygo", netPrice: 400, sellingPrice: 420 }), // marge 20
    rate({ supplier: "cyberesa", netPrice: 380, sellingPrice: 420 }), // marge 40
  ]
  const ranked = rankOffers(rates, { strategy: "BEST_MARGIN" })
  assert.equal(ranked[0].supplier, "cyberesa")
})

test("rankOffers PREFERRED_SUPPLIER : respecte l'ordre de préférence explicite", () => {
  const rates = [rate({ supplier: "mygo", sellingPrice: 400 }), rate({ supplier: "3t", sellingPrice: 400 })]
  const ranked = rankOffers(rates, { strategy: "PREFERRED_SUPPLIER", preferredSupplierOrder: ["3t", "mygo"] })
  assert.equal(ranked[0].supplier, "3t")
})

test("rankOffers BEST_VALUE : une offre remboursable gratuite bat une offre moins chère non remboursable", () => {
  const cheap = rate({ supplier: "mygo", sellingPrice: 400, cancellationPolicy: { type: "NON_REFUNDABLE" } })
  const flexible = rate({ supplier: "cyberesa", sellingPrice: 410, cancellationPolicy: { type: "FREE_CANCELLATION" } })
  const ranked = rankOffers([cheap, flexible], { strategy: "BEST_VALUE" })
  assert.equal(ranked[0].supplier, "cyberesa")
})

test("scoreOffer : ne recalcule jamais un prix — retourne toujours 0..1", () => {
  const rates = [rate({ sellingPrice: 100 }), rate({ sellingPrice: 900 })]
  for (const r of rates) {
    const score = scoreOffer(r, rates)
    assert.ok(score >= 0 && score <= 1)
  }
})

test("rankOffers : liste vide -> liste vide, jamais d'erreur", () => {
  assert.deepEqual(rankOffers([]), [])
})
