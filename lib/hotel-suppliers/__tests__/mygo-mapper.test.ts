import test from "node:test"
import assert from "node:assert/strict"
import { mapMyGoHotelSummary, mapMyGoOfferToRates, encodeMyGoSupplierToken, decodeMyGoSupplierToken } from "../mygo/mapper"
import type { HotelOfferDTO, HotelSummaryDTO } from "@/lib/mygo/types"

function summary(overrides: Partial<HotelSummaryDTO> = {}): HotelSummaryDTO {
  return {
    id: 500001,
    name: "El Mouradi Gammarth",
    stars: 5,
    cityName: "Gammarth",
    address: "Route Touristique",
    image: "https://example.com/x.jpg",
    latitude: "36.9",
    longitude: "10.3",
    facilities: [{ title: "Piscine" }],
    themes: [],
    ...overrides,
  }
}

test("mapMyGoHotelSummary : conserve le mapping fournisseur mygo et convertit les coordonnées en nombres", () => {
  const hotel = mapMyGoHotelSummary(summary())
  assert.equal(hotel.name, "El Mouradi Gammarth")
  assert.equal(hotel.latitude, 36.9)
  assert.equal(hotel.longitude, 10.3)
  assert.deepEqual(hotel.supplierMappings, [{ supplier: "mygo", supplierHotelCode: "500001" }])
})

test("encode/decodeMyGoSupplierToken : round-trip fidèle, jamais interprété ailleurs que par ce driver", () => {
  const input = { cityId: 1, hotelId: 500001, boardingId: 7, roomId: 42, searchToken: "abc-search-token" }
  const encoded = encodeMyGoSupplierToken(input)
  const decoded = decodeMyGoSupplierToken(encoded)
  assert.deepEqual(decoded, input)
})

test("mapMyGoOfferToRates : une offre avec 2 boardings x 1 room devient 2 NormalizedRate distincts, prix jamais recalculé", () => {
  const offer: HotelOfferDTO = {
    hotel: summary(),
    token: "search-token-xyz",
    currency: "TND",
    fromPrice: 400,
    recommended: false,
    boardings: [
      {
        id: 10,
        code: "BB",
        name: "Petit-déjeuner",
        pax: [
          {
            adult: 2,
            child: [],
            rooms: [
              {
                id: 100,
                name: "Chambre Double",
                price: 420,
                basePrice: 400,
                stopReservation: false,
                notRefundable: false,
                cancellationPolicies: [{ fees: 0, type: "PRICE", nature: "BEFORE_ARRIVAL", fromDate: "2026-09-05" }],
              },
            ],
          },
        ],
      },
      {
        id: 11,
        code: "AI",
        name: "Tout compris",
        pax: [
          {
            adult: 2,
            child: [],
            rooms: [
              {
                id: 101,
                name: "Chambre Double",
                price: 500,
                basePrice: 470,
                stopReservation: false,
                notRefundable: true,
                cancellationPolicies: [{ fees: 50, type: "PRICE", nature: "BEFORE_ARRIVAL", fromDate: "2026-09-01" }],
              },
            ],
          },
        ],
      },
    ],
  }

  const rates = mapMyGoOfferToRates(offer, 1, { adults: 2 })
  assert.equal(rates.length, 2)
  assert.equal(rates[0].sellingPrice, 420)
  assert.equal(rates[0].netPrice, 400)
  assert.equal(rates[0].refundable, true)
  assert.equal(rates[0].cancellationPolicy.type, "FREE_CANCELLATION")
  assert.equal(rates[1].sellingPrice, 500)
  assert.equal(rates[1].refundable, false)
  assert.equal(rates[1].cancellationPolicy.type, "NON_REFUNDABLE")

  const decoded = decodeMyGoSupplierToken(rates[0].supplierToken as string)
  assert.equal(decoded.hotelId, 500001)
  assert.equal(decoded.boardingId, 10)
  assert.equal(decoded.roomId, 100)
  assert.equal(decoded.searchToken, "search-token-xyz")
})

test("mapMyGoOfferToRates : room bloquée (stopReservation) devient ON_REQUEST, jamais AVAILABLE", () => {
  const offer: HotelOfferDTO = {
    hotel: summary(),
    token: "t",
    currency: "TND",
    fromPrice: 300,
    recommended: false,
    boardings: [
      {
        id: 1,
        code: "RO",
        name: "Logement seul",
        pax: [
          {
            adult: 2,
            child: [],
            rooms: [{ id: 1, name: "Suite", price: 300, stopReservation: true, notRefundable: false, cancellationPolicies: [] }],
          },
        ],
      },
    ],
  }
  const rates = mapMyGoOfferToRates(offer, 1, { adults: 2 })
  assert.equal(rates[0].availability, "ON_REQUEST")
})

test("mapMyGoOfferToRates : fournisseur sans info d'annulation -> UNKNOWN, jamais inventée en FREE_CANCELLATION", () => {
  const offer: HotelOfferDTO = {
    hotel: summary(),
    token: "t",
    currency: "TND",
    fromPrice: 300,
    recommended: false,
    boardings: [
      {
        id: 1,
        code: "RO",
        name: "Logement seul",
        pax: [
          {
            adult: 2,
            child: [],
            rooms: [{ id: 1, name: "Suite", price: 300, stopReservation: false, notRefundable: false, cancellationPolicies: [] }],
          },
        ],
      },
    ],
  }
  const rates = mapMyGoOfferToRates(offer, 1, { adults: 2 })
  assert.equal(rates[0].cancellationPolicy.type, "UNKNOWN")
})
