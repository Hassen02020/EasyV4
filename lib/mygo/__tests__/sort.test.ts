/**
 * Tests unitaires pour `lib/mygo/sort.ts` (Sort Engine).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { sortOffers, isHotelSortMode } from "../sort"
import type { HotelOfferDTO } from "../types"

function makeOffer(opts: {
  id: number
  price: number
  stars?: number
  recommended?: boolean
}): HotelOfferDTO {
  return {
    hotel: {
      id: opts.id,
      name: `Hotel ${opts.id}`,
      stars: opts.stars,
      facilities: [],
      themes: [],
    },
    token: `token-${opts.id}`,
    currency: "TND",
    fromPrice: opts.price,
    recommended: opts.recommended ?? false,
    boardings: [],
  }
}

test("sortOffers price_asc : trie par prix croissant", () => {
  const offers = [
    makeOffer({ id: 1, price: 300 }),
    makeOffer({ id: 2, price: 100 }),
    makeOffer({ id: 3, price: 200 }),
  ]
  const sorted = sortOffers(offers, "price_asc")
  assert.deepEqual(
    sorted.map((o) => o.hotel.id),
    [2, 3, 1],
  )
})

test("sortOffers price_desc : trie par prix décroissant", () => {
  const offers = [
    makeOffer({ id: 1, price: 300 }),
    makeOffer({ id: 2, price: 100 }),
    makeOffer({ id: 3, price: 200 }),
  ]
  const sorted = sortOffers(offers, "price_desc")
  assert.deepEqual(
    sorted.map((o) => o.hotel.id),
    [1, 3, 2],
  )
})

test("sortOffers recommended : les offres recommandées passent en premier, prix croissant en départage", () => {
  const offers = [
    makeOffer({ id: 1, price: 200, recommended: false }),
    makeOffer({ id: 2, price: 400, recommended: true }),
    makeOffer({ id: 3, price: 300, recommended: true }),
  ]
  const sorted = sortOffers(offers, "recommended")
  assert.deepEqual(
    sorted.map((o) => o.hotel.id),
    [3, 2, 1],
  )
})

test("sortOffers best_deal : favorise un prix bas ramené aux étoiles (fromPrice / max(stars,1))", () => {
  // Hotel A : 100 TND / 5 étoiles = score 20 (meilleur)
  // Hotel B : 90 TND / 1 étoile (pas d'étoiles connues) = score 90
  const offers = [
    makeOffer({ id: 1, price: 90, stars: 0 }),
    makeOffer({ id: 2, price: 100, stars: 5 }),
  ]
  const sorted = sortOffers(offers, "best_deal")
  assert.deepEqual(
    sorted.map((o) => o.hotel.id),
    [2, 1],
  )
})

test("sortOffers ne mute pas le tableau d'entrée", () => {
  const offers = [makeOffer({ id: 1, price: 200 }), makeOffer({ id: 2, price: 100 })]
  const original = [...offers]
  sortOffers(offers, "price_asc")
  assert.deepEqual(offers, original)
})

test("isHotelSortMode : reconnaît uniquement les modes valides", () => {
  assert.equal(isHotelSortMode("price_asc"), true)
  assert.equal(isHotelSortMode("recommended"), true)
  assert.equal(isHotelSortMode("best_deal"), true)
  assert.equal(isHotelSortMode("price_desc"), true)
  assert.equal(isHotelSortMode("bogus"), false)
  assert.equal(isHotelSortMode(null), false)
})
