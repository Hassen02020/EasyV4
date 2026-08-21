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

function makeOfferWithBoardings(
  id: number,
  boardings: { name: string; price: number }[],
): HotelOfferDTO {
  return {
    hotel: { id, name: `Hotel ${id}`, facilities: [], themes: [] },
    token: `token-${id}`,
    currency: "TND",
    fromPrice: Math.min(...boardings.map((b) => b.price)),
    recommended: false,
    boardings: boardings.map((b, i) => ({
      id: i,
      code: b.name.slice(0, 3).toUpperCase(),
      name: b.name,
      pax: [
        {
          adult: 2,
          child: [],
          rooms: [
            {
              id: 100 + i,
              name: "Standard",
              price: b.price,
              stopReservation: false,
              notRefundable: false,
              cancellationPolicies: [],
            },
          ],
        },
      ],
    })),
  }
}

test("sortOffers price_asc avec filtre de pension actif : trie sur le prix de LA pension filtrée, pas sur fromPrice global", () => {
  // Hotel 1 : moins cher globalement (RO 200), mais AI plus cher (500)
  // Hotel 2 : plus cher globalement (RO 300), mais AI moins cher (450)
  // Sans le fix, price_asc trierait sur fromPrice (200 < 300 -> [1, 2]),
  // alors que les cards affichent 500 (Hotel 1) et 450 (Hotel 2) une fois
  // le filtre "All Inclusive" actif — un ordre visuellement décroissant.
  const hotel1 = makeOfferWithBoardings(1, [
    { name: "Petit-déjeuner", price: 200 },
    { name: "All Inclusive", price: 500 },
  ])
  const hotel2 = makeOfferWithBoardings(2, [
    { name: "Petit-déjeuner", price: 300 },
    { name: "All Inclusive", price: 450 },
  ])
  const sorted = sortOffers([hotel1, hotel2], "price_asc", ["All Inclusive"])
  assert.deepEqual(
    sorted.map((o) => o.hotel.id),
    [2, 1],
  )
})

test("sortOffers price_asc sans filtre de pension : se comporte comme avant (fromPrice global)", () => {
  const hotel1 = makeOfferWithBoardings(1, [
    { name: "Petit-déjeuner", price: 200 },
    { name: "All Inclusive", price: 500 },
  ])
  const hotel2 = makeOfferWithBoardings(2, [
    { name: "Petit-déjeuner", price: 300 },
    { name: "All Inclusive", price: 450 },
  ])
  const sorted = sortOffers([hotel1, hotel2], "price_asc", [])
  assert.deepEqual(
    sorted.map((o) => o.hotel.id),
    [1, 2],
  )
})

test("isHotelSortMode : reconnaît uniquement les modes valides", () => {
  assert.equal(isHotelSortMode("price_asc"), true)
  assert.equal(isHotelSortMode("recommended"), true)
  assert.equal(isHotelSortMode("best_deal"), true)
  assert.equal(isHotelSortMode("price_desc"), true)
  assert.equal(isHotelSortMode("bogus"), false)
  assert.equal(isHotelSortMode(null), false)
})
