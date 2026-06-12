import test from "node:test"
import assert from "node:assert/strict"
import {
  applyMargin,
  applyMarginsToHotel,
  applyMarginsToOffers,
  DEFAULT_MARGINS,
  marginDelta,
  type MarginRule,
} from "../pricing"

const percent10: MarginRule = {
  marginType: "percent",
  marginValue: 10,
  isActive: true,
}
const fixed25: MarginRule = {
  marginType: "fixed",
  marginValue: 25,
  isActive: true,
}
const inactive: MarginRule = {
  marginType: "percent",
  marginValue: 50,
  isActive: false,
}

test("applyMargin percent: 1000 TND + 10% → 1100 TND", () => {
  assert.equal(applyMargin(1000, percent10), 1100)
})

test("applyMargin fixed: 1000 TND + 25 DT → 1025 TND", () => {
  assert.equal(applyMargin(1000, fixed25), 1025)
})

test("applyMargin inactive: 1000 TND → 1000 TND (passthrough)", () => {
  assert.equal(applyMargin(1000, inactive), 1000)
})

test("applyMargin arrondit à 3 décimales (TND)", () => {
  // 841.253 × 1.10 = 925.3783 → 925.378 (3 décimales)
  assert.equal(applyMargin(841.253, percent10), 925.378)
})

test("marginDelta calcule le markup TND", () => {
  // 1000 × 1.10 = 1100 → delta = 100
  assert.equal(marginDelta(1000, percent10), 100)
  // 1000 + 25 = 1025 → delta = 25
  assert.equal(marginDelta(1000, fixed25), 25)
})

test("applyMarginsToHotel : tous les prix rooms sont markup'és", () => {
  const hotel = {
    id: "h1",
    rooms: [{ prices: { BB: 500, HB: 750, AI: 1000 } }],
  }
  const map = { ...DEFAULT_MARGINS, hotel: percent10 }
  const out = applyMarginsToHotel(hotel, map)
  assert.equal(out.id, "h1")
  assert.equal(out.rooms[0]!.prices["BB"], 550)
  assert.equal(out.rooms[0]!.prices["HB"], 825)
  assert.equal(out.rooms[0]!.prices["AI"], 1100)
  // L'objet hotel d'origine est inchangé (immutabilité).
  assert.equal(hotel.rooms[0]!.prices["BB"], 500)
})

test("applyMarginsToOffers : marge appliquée à chaque RoomOffer", () => {
  const offers = [
    { id: "o1", price: 600 },
    { id: "o2", price: 1500 },
  ]
  const map = { ...DEFAULT_MARGINS, hotel: fixed25 }
  const out = applyMarginsToOffers(offers, map)
  assert.equal(out[0]!.price, 625)
  assert.equal(out[1]!.price, 1525)
})

test("DEFAULT_MARGINS contient les 6 modules", () => {
  const expected = [
    "hotel",
    "flight",
    "omra",
    "package",
    "activity",
    "transfer",
  ]
  for (const m of expected) {
    const rule = DEFAULT_MARGINS[m as keyof typeof DEFAULT_MARGINS]
    assert.ok(rule, `Module ${m} doit avoir une règle par défaut`)
    assert.ok(rule.isActive, `Module ${m} doit être actif par défaut`)
    assert.ok(rule.marginValue >= 0, `Module ${m} doit avoir une valeur ≥ 0`)
  }
})
