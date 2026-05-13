/**
 * Tests des mappers contre des fixtures réelles capturées depuis l'API myGo
 * (voir lib/mygo/__fixtures__/). Lancer avec:
 *
 *   pnpm test:mygo
 *
 * Les fixtures contiennent UNIQUEMENT des données publiques (noms d'hôtels et de villes
 * de Tunisie) — pas de credentials.
 */

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  ListBoardingResponse,
  ListCityResponse,
  ListCurrencyResponse,
  ListTagResponse,
  HotelDetailResponse,
  HotelSearchResponse,
} from "../schemas"
import {
  dedupeOffersByHotelId,
  isRealHotelOffer,
  lowestPrice,
  mapBoarding,
  mapCity,
  mapCurrency,
  mapHotelDetails,
  mapHotelOffer,
  mapTag,
} from "../mappers"
import type { HotelOfferDTO } from "../types"

const FIX_DIR = join(__dirname, "..", "__fixtures__")
const readFixture = (name: string) =>
  JSON.parse(readFileSync(join(FIX_DIR, name), "utf8"))

test("mapCity normalizes ListCity response", () => {
  const raw = ListCityResponse.parse(readFixture("listcity.json"))
  assert.ok(raw.ListCity, "ListCity present")
  assert.ok(raw.ListCity!.length >= 30, "expect at least 30 cities")
  const hammamet = raw.ListCity!.find((c) => c.Name === "Hammamet")
  assert.ok(hammamet, "Hammamet present")
  const dto = mapCity(hammamet!)
  assert.equal(dto.id, 10)
  assert.equal(dto.name, "Hammamet")
  assert.equal(dto.region, "Cap Bon")
  assert.equal(dto.countryName, "Tunisie")
})

test("mapBoarding parses all boarding types", () => {
  const raw = ListBoardingResponse.parse(readFixture("listboarding.json"))
  const dtos = (raw.ListBoarding ?? []).map(mapBoarding)
  assert.ok(dtos.some((b) => b.code === "ALL" && b.name === "All Inclusive"))
  assert.ok(dtos.some((b) => b.code === "DP" && b.name === "Demi Pension"))
  assert.ok(dtos.some((b) => b.code === "LPD"))
})

test("mapCurrency includes TND/EUR/USD", () => {
  const raw = ListCurrencyResponse.parse(readFixture("listcurrency.json"))
  const dtos = (raw.ListCurrency ?? []).map(mapCurrency)
  const tnd = dtos.find((c) => c.code === "TND")
  assert.ok(tnd, "TND present")
  assert.equal(tnd!.symbol, "DT")
  assert.ok(dtos.find((c) => c.code === "EUR"))
})

test("mapTag parses ListTag", () => {
  const raw = ListTagResponse.parse(readFixture("listtag.json"))
  const dtos = (raw.ListTag ?? []).map(mapTag)
  assert.ok(dtos.length > 0, "tags non-empty")
  assert.ok(dtos.every((t) => typeof t.id === "number" && t.title.length > 0))
})

test("mapHotelDetails extracts album + options", () => {
  const raw = HotelDetailResponse.parse(readFixture("hoteldetail.json"))
  assert.ok(raw.HotelDetail)
  const dto = mapHotelDetails(raw.HotelDetail!)
  assert.equal(dto.id, 646)
  assert.equal(dto.name, "Yocca Hotel Residence (Lella Halima)")
  assert.equal(dto.cityId, 10)
  assert.equal(dto.cityName, "Hammamet")
  assert.equal(dto.email, "booking@yoccahotelresidence.com")
  assert.equal(dto.checkInTime, "14:00")
  assert.ok(dto.album.length >= 1, "album non-empty")
  assert.ok(dto.options.length >= 1, "options non-empty")
})

test("HotelSearch: schema parses, real-hotel filter, lowestPrice, mapHotelOffer", () => {
  const raw = HotelSearchResponse.parse(readFixture("hotelsearch.json"))
  assert.ok(raw.HotelSearch)
  const items = raw.HotelSearch!
  assert.ok(items.length >= 50, `expected >= 50 results, got ${items.length}`)

  // Le 1er item est un parc d'attraction (Carthage Land/Aqualand) — doit être filtré
  const first = items[0]!
  assert.equal(
    isRealHotelOffer(first),
    false,
    "first item is an attraction, must be filtered out",
  )

  // Le 2ème item devrait être un vrai hôtel
  const yocca = items.find((h) => h.Hotel?.Name?.includes("Yocca"))
  assert.ok(yocca, "Yocca hotel present")
  assert.equal(isRealHotelOffer(yocca!), true)

  // Le token doit exister
  assert.ok(yocca!.Token && yocca!.Token.length > 30, "token is non-empty")

  // mapHotelOffer doit produire un DTO complet
  const offer = mapHotelOffer(yocca!)
  assert.equal(offer.hotel.id, 646)
  assert.equal(offer.hotel.stars, 4)
  assert.equal(offer.hotel.cityName, "Hammamet")
  assert.ok(offer.token.length > 30)
  assert.ok(offer.fromPrice > 0)
  assert.ok(offer.boardings.length > 0)
  const firstBoard = offer.boardings[0]!
  assert.ok(firstBoard.pax.length > 0)
  assert.ok(firstBoard.pax[0]!.rooms.length > 0)

  // CancellationPolicy doit être bien typée
  const room = firstBoard.pax[0]!.rooms[0]!
  for (const p of room.cancellationPolicies) {
    assert.ok(
      ["PRICE", "PERCENT", "NIGHT"].includes(p.type) ||
        typeof p.type === "string",
    )
    assert.ok(
      ["NO_SHOW", "PREMATURE_DEPARTURE", "BEFORE_ARRIVAL"].includes(p.nature) ||
        typeof p.nature === "string",
    )
  }

  // lowestPrice cohérent
  const lp = lowestPrice(yocca!)
  assert.equal(offer.fromPrice, lp)
})

test("Filtre les offres non-hôtelières du résultat global", () => {
  const raw = HotelSearchResponse.parse(readFixture("hotelsearch.json"))
  const items = raw.HotelSearch!
  const realHotels = items.filter(isRealHotelOffer)
  // Réduit le bruit (en pratique on garde > 50 offres sur 75)
  assert.ok(realHotels.length >= 50, `kept ${realHotels.length} real hotels`)
  assert.ok(realHotels.length < items.length, "filtered some non-hotel items")
})

test("dedupeOffersByHotelId: keeps best entry, merges boardings", () => {
  const baseOffer = (
    id: number,
    name: string,
    stars: number | undefined,
    fromPrice: number,
    boardingNames: string[],
  ): HotelOfferDTO => ({
    hotel: {
      id,
      name,
      stars,
      facilities: [],
      themes: [],
    },
    token: `tok-${id}-${stars ?? "na"}`,
    currency: "TND",
    fromPrice,
    recommended: false,
    boardings: boardingNames.map((n, idx) => ({
      id: idx,
      code: n.slice(0, 3).toUpperCase(),
      name: n,
      pax: [],
    })),
  })

  const offers: HotelOfferDTO[] = [
    baseOffer(44, "Houda Yasmine Marina & Spa", 4, 1450, ["Demi Pension"]),
    baseOffer(44, "Houda Yasmine Marina & Spa ", undefined, 1500, [
      "Soft All Inclusive",
    ]),
    baseOffer(16, "Le Royal Hammamet", 5, 1570, ["Logement Petit Déjeuner"]),
    baseOffer(67, "The Russelior Hotel & Spa", 5, 1776, [
      "Logement Petit Déjeuner",
    ]),
  ]
  const deduped = dedupeOffersByHotelId(offers)
  assert.equal(deduped.length, 3, "expects 1 entry per hotel id")
  const houda = deduped.find((o) => o.hotel.id === 44)!
  // The 4★ entry wins over the 0★ duplicate
  assert.equal(houda.hotel.stars, 4)
  // Boardings are merged from both duplicates
  const boardingNames = houda.boardings.map((b) => b.name).sort()
  assert.deepEqual(boardingNames, ["Demi Pension", "Soft All Inclusive"])
  // Lowest price across both entries
  assert.equal(houda.fromPrice, 1450)
})

test("Auth error response is captured in ErrorMessage object", () => {
  const raw = ListCityResponse.parse(readFixture("error_auth.json"))
  assert.ok(raw.ErrorMessage)
  assert.equal(typeof raw.ErrorMessage, "object")
  assert.ok(!Array.isArray(raw.ErrorMessage))
  const e = raw.ErrorMessage as { Code?: number; Description?: string }
  assert.ok(
    e.Code && e.Code >= 400 && e.Code < 500,
    `error code ${e.Code} should be 4xx`,
  )
  assert.match(e.Description ?? "", /login|password|user|invalid/i)
})
