/**
 * Tests unitaires pour `lib/mygo/facets.ts`.
 *
 *   pnpm test:facets
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  applyFilters,
  computeFacets,
  EMPTY_FILTER_STATE,
  type HotelFilterState,
} from "../facets"
import type { HotelOfferDTO } from "../types"

function makeOffer(opts: {
  id: number
  name: string
  stars?: number
  price: number
  facilities?: string[]
  themes?: string[]
  recommended?: boolean
  boardings?: { name: string; rooms?: number }[]
  notRefundable?: boolean
  stopReservation?: boolean
}): HotelOfferDTO {
  const boardings = opts.boardings ?? [{ name: "Petit Déjeuner" }]
  return {
    hotel: {
      id: opts.id,
      name: opts.name,
      stars: opts.stars,
      facilities: (opts.facilities ?? []).map((title) => ({ title })),
      themes: opts.themes ?? [],
    },
    token: `token-${opts.id}`,
    currency: "TND",
    fromPrice: opts.price,
    recommended: opts.recommended ?? false,
    boardings: boardings.map((b) => ({
      id: 1,
      code: b.name.slice(0, 3).toUpperCase(),
      name: b.name,
      pax: [
        {
          adult: 2,
          child: [],
          rooms: Array.from({ length: b.rooms ?? 1 }).map((_, i) => ({
            id: 100 + i,
            name: "Standard",
            price: opts.price,
            stopReservation: opts.stopReservation ?? false,
            notRefundable: opts.notRefundable ?? false,
            cancellationPolicies: opts.notRefundable
              ? []
              : [
                  {
                    fees: 0,
                    type: "PRICE",
                    nature: "BEFORE_ARRIVAL",
                    fromDate: "2026-07-01",
                  },
                ],
          })),
        },
      ],
    })),
  }
}

test("computeFacets agrège stars/boardings/facilities/prix", () => {
  const offers: HotelOfferDTO[] = [
    makeOffer({
      id: 1,
      name: "A",
      stars: 4,
      price: 500,
      facilities: ["Piscine", "Wi-Fi"],
      recommended: true,
    }),
    makeOffer({
      id: 2,
      name: "B",
      stars: 5,
      price: 1200,
      facilities: ["Piscine", "Spa"],
      boardings: [{ name: "All Inclusive" }],
    }),
    makeOffer({
      id: 3,
      name: "C",
      stars: 4,
      price: 800,
      facilities: ["Wi-Fi"],
      boardings: [{ name: "Demi Pension" }, { name: "All Inclusive" }],
    }),
  ]
  const f = computeFacets(offers)

  assert.equal(f.priceMin, 500)
  assert.equal(f.priceMax, 1200)
  assert.equal(f.recommendedCount, 1)
  assert.equal(f.availableCount, 3)
  assert.equal(f.freeCancellationCount, 3)

  const stars = Object.fromEntries(f.stars.map((s) => [s.value, s.count]))
  assert.equal(stars[4], 2)
  assert.equal(stars[5], 1)

  const boardings = Object.fromEntries(
    f.boardings.map((b) => [b.name, b.count]),
  )
  assert.equal(boardings["Petit Déjeuner"], 1)
  assert.equal(boardings["All Inclusive"], 2)
  assert.equal(boardings["Demi Pension"], 1)

  const facilities = Object.fromEntries(
    f.facilities.map((fa) => [fa.title, fa.count]),
  )
  assert.equal(facilities["Piscine"], 2)
  assert.equal(facilities["Wi-Fi"], 2)
  assert.equal(facilities["Spa"], 1)
})

test("applyFilters: filtre par étoiles", () => {
  const offers = [
    makeOffer({ id: 1, name: "A", stars: 4, price: 500 }),
    makeOffer({ id: 2, name: "B", stars: 5, price: 1200 }),
  ]
  const filters: HotelFilterState = { ...EMPTY_FILTER_STATE, stars: [5] }
  const result = applyFilters(offers, filters)
  assert.equal(result.length, 1)
  assert.equal(result[0].hotel.id, 2)
})

test("applyFilters: filtre par boarding (OR sur la liste)", () => {
  const offers = [
    makeOffer({
      id: 1,
      name: "A",
      stars: 4,
      price: 500,
      boardings: [{ name: "Demi Pension" }],
    }),
    makeOffer({
      id: 2,
      name: "B",
      stars: 5,
      price: 1200,
      boardings: [{ name: "All Inclusive" }],
    }),
    makeOffer({
      id: 3,
      name: "C",
      stars: 4,
      price: 800,
      boardings: [{ name: "Petit Déjeuner" }],
    }),
  ]
  const filters: HotelFilterState = {
    ...EMPTY_FILTER_STATE,
    boardings: ["All Inclusive", "Demi Pension"],
  }
  const result = applyFilters(offers, filters)
  assert.deepEqual(result.map((o) => o.hotel.id).sort(), [1, 2])
})

test("applyFilters: filtre par facility (AND — toutes doivent être présentes)", () => {
  const offers = [
    makeOffer({
      id: 1,
      name: "A",
      stars: 4,
      price: 500,
      facilities: ["Piscine", "Wi-Fi"],
    }),
    makeOffer({
      id: 2,
      name: "B",
      stars: 5,
      price: 1200,
      facilities: ["Piscine"],
    }),
    makeOffer({
      id: 3,
      name: "C",
      stars: 4,
      price: 800,
      facilities: ["Piscine", "Wi-Fi", "Spa"],
    }),
  ]
  const filters: HotelFilterState = {
    ...EMPTY_FILTER_STATE,
    facilities: ["Piscine", "Wi-Fi"],
  }
  const result = applyFilters(offers, filters)
  assert.deepEqual(result.map((o) => o.hotel.id).sort(), [1, 3])
})

test("applyFilters: filtre par prix range", () => {
  const offers = [
    makeOffer({ id: 1, name: "A", stars: 4, price: 500 }),
    makeOffer({ id: 2, name: "B", stars: 5, price: 1200 }),
    makeOffer({ id: 3, name: "C", stars: 4, price: 800 }),
  ]
  const filters: HotelFilterState = {
    ...EMPTY_FILTER_STATE,
    priceRange: [600, 1000],
  }
  const result = applyFilters(offers, filters)
  assert.equal(result.length, 1)
  assert.equal(result[0].hotel.id, 3)
})

test("applyFilters: combine plusieurs filtres", () => {
  const offers = [
    makeOffer({
      id: 1,
      name: "A",
      stars: 4,
      price: 500,
      facilities: ["Piscine"],
      recommended: true,
    }),
    makeOffer({
      id: 2,
      name: "B",
      stars: 5,
      price: 1200,
      facilities: ["Piscine"],
      recommended: false,
    }),
  ]
  const filters: HotelFilterState = {
    ...EMPTY_FILTER_STATE,
    recommendedOnly: true,
    facilities: ["Piscine"],
  }
  const result = applyFilters(offers, filters)
  assert.equal(result.length, 1)
  assert.equal(result[0].hotel.id, 1)
})

test("applyFilters: vide = tous les hôtels passent", () => {
  const offers = [
    makeOffer({ id: 1, name: "A", stars: 4, price: 500 }),
    makeOffer({ id: 2, name: "B", stars: 5, price: 1200 }),
  ]
  const result = applyFilters(offers, EMPTY_FILTER_STATE)
  assert.equal(result.length, 2)
})

test("applyFilters: notRefundable exclut de freeCancellationOnly", () => {
  const offers = [
    makeOffer({ id: 1, name: "A", stars: 4, price: 500 }),
    makeOffer({
      id: 2,
      name: "B",
      stars: 5,
      price: 1200,
      notRefundable: true,
    }),
  ]
  const filters: HotelFilterState = {
    ...EMPTY_FILTER_STATE,
    freeCancellationOnly: true,
  }
  const result = applyFilters(offers, filters)
  assert.equal(result.length, 1)
  assert.equal(result[0].hotel.id, 1)
})
