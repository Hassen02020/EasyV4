import test from "node:test"
import assert from "node:assert/strict"

import { toHotelSearchParams, nightsFor } from "../api-mapper"
import { defaultSearchState } from "../types"
import type { HotelSearchState } from "../types"

function stateWith(overrides: Partial<HotelSearchState>): HotelSearchState {
  return {
    ...defaultSearchState,
    dates: { checkIn: new Date("2026-06-01T00:00:00Z"), checkOut: new Date("2026-06-08T00:00:00Z"), nights: 7 },
    ...overrides,
  }
}

test("toHotelSearchParams : une chambre encode adults/children à plat, pas de clé rooms", () => {
  const state = stateWith({
    destination: { cityId: 32, city: "Tunis" },
    rooms: [{ adults: 2, children: 1, childAges: [5] }],
  })
  const params = toHotelSearchParams(state)
  assert.equal(params.get("cityId"), "32")
  assert.equal(params.get("city"), "Tunis")
  assert.equal(params.get("checkin"), "2026-06-01")
  assert.equal(params.get("checkout"), "2026-06-08")
  assert.equal(params.get("adults"), "2")
  assert.equal(params.get("children"), "5")
  assert.equal(params.get("rooms"), null, "une seule chambre : pas de clé rooms encodée")
  assert.equal(params.get("roomsCount"), "1")
})

test("toHotelSearchParams : plusieurs chambres encode la vraie composition via rooms (encodeRoomsParam)", () => {
  const state = stateWith({
    destination: { cityId: 10, city: "Hammamet" },
    rooms: [
      { adults: 2, children: 2, childAges: [7, 3] },
      { adults: 2, children: 0, childAges: [] },
    ],
  })
  const params = toHotelSearchParams(state)
  assert.equal(params.get("rooms"), "2-7.3|2")
  // adults/children agrégés restent présents (repli historique pour tout
  // code qui ne lit pas encore `rooms`), mais dérivés des VRAIES chambres.
  assert.equal(params.get("adults"), "4")
  assert.equal(params.get("children"), "7,3")
  assert.equal(params.get("roomsCount"), "2")
})

test("toHotelSearchParams : hotelId et zone transmis quand renseignés", () => {
  const state = stateWith({
    destination: { cityId: 10, hotelId: 4821, zone: "Cap Bon" },
    rooms: [{ adults: 2, children: 0, childAges: [] }],
  })
  const params = toHotelSearchParams(state)
  assert.equal(params.get("hotelId"), "4821")
  assert.equal(params.get("zone"), "Cap Bon")
})

test("toHotelSearchParams : stars et onlyAvailable transmis via options", () => {
  const state = stateWith({
    destination: { cityId: 10 },
    rooms: [{ adults: 2, children: 0, childAges: [] }],
  })
  const params = toHotelSearchParams(state, { stars: [4, 5], onlyAvailable: true })
  assert.equal(params.get("stars"), "4,5")
  assert.equal(params.get("onlyAvailable"), "1")
})

test("toHotelSearchParams : sans étoiles ni onlyAvailable, ces clés sont absentes", () => {
  const state = stateWith({
    destination: { cityId: 10 },
    rooms: [{ adults: 2, children: 0, childAges: [] }],
  })
  const params = toHotelSearchParams(state)
  assert.equal(params.get("stars"), null)
  assert.equal(params.get("onlyAvailable"), null)
})

test("nightsFor : délègue au calcul de nuits", () => {
  const state = stateWith({})
  assert.equal(nightsFor(state), 7)
})
