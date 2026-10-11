/**
 * COMMERCIAL-HOTELS-01 — Tests du moteur de règles commerciales hôtels
 * node --import tsx --test lib/hotels/__tests__/commercial-engine.test.ts
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  computeHotelCommercialResult,
  matchesHotelProductScope,
  type HotelCommercialRules,
  type HotelProductScope,
} from "../commercial-engine"

describe("matchesHotelProductScope", () => {
  it("NULL scope matches everything", () => {
    assert.ok(
      matchesHotelProductScope(null, { destination: "TUN", provider: "mygo" }),
    )
  })

  it("empty scope matches everything", () => {
    assert.ok(matchesHotelProductScope({}, { destination: "TUN", stars: 4 }))
  })

  it("matching destination passes", () => {
    assert.ok(
      matchesHotelProductScope({ destination: "TUN" }, { destination: "TUN" }),
    )
  })

  it("non-matching destination fails", () => {
    assert.equal(
      matchesHotelProductScope({ destination: "PAR" }, { destination: "TUN" }),
      false,
    )
  })

  it("matching provider passes", () => {
    assert.ok(
      matchesHotelProductScope({ provider: "mygo" }, { provider: "mygo" }),
    )
  })

  it("non-matching provider fails", () => {
    assert.equal(
      matchesHotelProductScope({ provider: "cyberesa" }, { provider: "mygo" }),
      false,
    )
  })

  it("matching stars passes", () => {
    assert.ok(matchesHotelProductScope({ stars: 4 }, { stars: 4 }))
  })

  it("non-matching stars fails", () => {
    assert.equal(matchesHotelProductScope({ stars: 5 }, { stars: 4 }), false)
  })

  it("matching boardBasis passes", () => {
    assert.ok(
      matchesHotelProductScope({ boardBasis: "BB" }, { boardBasis: "BB" }),
    )
  })

  it("non-matching boardBasis fails", () => {
    assert.equal(
      matchesHotelProductScope({ boardBasis: "AI" }, { boardBasis: "BB" }),
      false,
    )
  })

  it("scope field absent in hints is ignored", () => {
    // scope has destination but hints don't — not a mismatch, skip filter
    assert.ok(
      matchesHotelProductScope({ destination: "TUN" }, { provider: "mygo" }),
    )
  })

  it("multi-field scope: all match passes", () => {
    assert.ok(
      matchesHotelProductScope(
        { destination: "TUN", stars: 4 },
        { destination: "TUN", stars: 4 },
      ),
    )
  })

  it("multi-field scope: one mismatch fails", () => {
    assert.equal(
      matchesHotelProductScope(
        { destination: "TUN", stars: 5 },
        { destination: "TUN", stars: 4 },
      ),
      false,
    )
  })
})

describe("computeHotelCommercialResult", () => {
  const baseRules: HotelCommercialRules = {
    fixedFee: 15,
    markupRate: 0.05,
    currency: "TND",
  }

  it("applies fixed fee + markup correctly", () => {
    const result = computeHotelCommercialResult(200, "TND", baseRules)
    assert.equal(result.supplierAmount, 200)
    assert.equal(result.fee, 15)
    assert.equal(result.markup, 10) // 200 * 0.05
    assert.equal(result.sellingAmount, 225)
    assert.equal(result.sellingCurrency, "TND")
  })

  it("zero fixedFee + zero markupRate = passthrough", () => {
    const rules: HotelCommercialRules = {
      fixedFee: 0,
      markupRate: 0,
      currency: "TND",
    }
    const result = computeHotelCommercialResult(300, "TND", rules)
    assert.equal(result.sellingAmount, 300)
    assert.equal(result.fee, 0)
    assert.equal(result.markup, 0)
  })

  it("minMarkup floor applied", () => {
    const rules: HotelCommercialRules = {
      fixedFee: 0,
      markupRate: 0.01,
      minMarkup: 20,
      currency: "TND",
    }
    // natural markup = 100 * 0.01 = 1, floor = 20
    const result = computeHotelCommercialResult(100, "TND", rules)
    assert.equal(result.markup, 20)
    assert.equal(result.sellingAmount, 120)
  })

  it("maxMarkup ceiling applied", () => {
    const rules: HotelCommercialRules = {
      fixedFee: 0,
      markupRate: 0.2,
      maxMarkup: 30,
      currency: "TND",
    }
    // natural markup = 200 * 0.2 = 40, ceiling = 30
    const result = computeHotelCommercialResult(200, "TND", rules)
    assert.equal(result.markup, 30)
    assert.equal(result.sellingAmount, 230)
  })

  it("throws on currency mismatch", () => {
    assert.throws(
      () => computeHotelCommercialResult(100, "EUR", baseRules),
      /CURRENCY-DIM-01/,
    )
  })

  it("rounds to 3 decimal places", () => {
    const rules: HotelCommercialRules = {
      fixedFee: 1.111,
      markupRate: 0.01111,
      currency: "TND",
    }
    const result = computeHotelCommercialResult(100, "TND", rules)
    assert.equal(result.fee, 1.111)
    assert.equal(result.markup, 1.111)
    assert.equal(result.sellingAmount, 102.222)
  })

  it("supplier amount preserved in result", () => {
    const result = computeHotelCommercialResult(500, "TND", baseRules)
    assert.equal(result.supplierAmount, 500)
    assert.equal(result.supplierCurrency, "TND")
  })
})
