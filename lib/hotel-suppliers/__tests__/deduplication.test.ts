import test from "node:test"
import assert from "node:assert/strict"
import { deduplicateHotels } from "../core/deduplication"
import type { NormalizedHotel, NormalizedRate } from "../core/types"

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
    cancellationPolicy: { type: "UNKNOWN" },
    refundable: true,
    availability: "AVAILABLE",
    ...overrides,
  }
}

test("deduplicateHotels : le même hôtel via 2 fournisseurs devient UN groupe, toutes les offres restent traçables", () => {
  const mygoHotel: NormalizedHotel = {
    id: "h-mygo",
    name: "El Mouradi Gammarth",
    city: "Gammarth",
    latitude: 36.9,
    longitude: 10.3,
    images: [],
    facilities: [],
    supplierMappings: [{ supplier: "mygo", supplierHotelCode: "500001" }],
  }
  const cyberesaHotel: NormalizedHotel = {
    id: "h-cyberesa",
    name: "El Mouradi Gammarth",
    city: "Gammarth",
    latitude: 36.9002,
    longitude: 10.3001,
    images: [],
    facilities: [],
    supplierMappings: [{ supplier: "cyberesa", supplierHotelCode: "CYB-42" }],
  }
  const rates = [
    rate({ hotelId: "h-mygo", supplier: "mygo", supplierHotelCode: "500001", sellingPrice: 420 }),
    rate({ hotelId: "h-cyberesa", supplier: "cyberesa", supplierHotelCode: "CYB-42", sellingPrice: 405 }),
  ]

  const groups = deduplicateHotels([mygoHotel, cyberesaHotel], rates)

  assert.equal(groups.length, 1, "un seul groupe visible côté client")
  assert.equal(groups[0].members.length, 2, "les 2 hôtels fournisseur restent membres du groupe")
  assert.equal(groups[0].rates.length, 2, "les 2 offres restent présentes et traçables")
  assert.equal(groups[0].fromPrice, 405, "le prix affiché est le plus bas des offres du groupe")
})

test("deduplicateHotels : hôtels non liés restent des groupes distincts", () => {
  const a: NormalizedHotel = {
    name: "Iberostar Selection",
    city: "Sousse",
    images: [],
    facilities: [],
    supplierMappings: [{ supplier: "mygo", supplierHotelCode: "1" }],
  }
  const b: NormalizedHotel = {
    name: "Movenpick Gammarth",
    city: "Tunis",
    images: [],
    facilities: [],
    supplierMappings: [{ supplier: "mygo", supplierHotelCode: "2" }],
  }
  const groups = deduplicateHotels([a, b], [])
  assert.equal(groups.length, 2)
})

test("deduplicateHotels : groupe sans offre a fromPrice=null (jamais 0 fabriqué)", () => {
  const a: NormalizedHotel = {
    name: "Hotel Sans Tarif",
    images: [],
    facilities: [],
    supplierMappings: [{ supplier: "mygo", supplierHotelCode: "9" }],
  }
  const groups = deduplicateHotels([a], [])
  assert.equal(groups[0].fromPrice, null)
})
