import test from "node:test"
import assert from "node:assert/strict"
import {
  signHotelPriceToken,
  verifyHotelPriceToken,
  signHotelSearchOffersInPlace,
  resolveDraftHotelPrice,
  type HotelPriceTokenContext,
} from "../price-token"

const BASE_CONTEXT: HotelPriceTokenContext = {
  hotelId: 42,
  roomId: 7,
  boardingId: 3,
  checkin: "2026-07-15",
  checkout: "2026-07-20",
  adults: 2,
  currency: "TND",
}

test("price-token: sign puis verify round-trip — même contexte, prix intact", () => {
  const token = signHotelPriceToken({ ...BASE_CONTEXT, unitPriceTnd: 150 })
  const result = verifyHotelPriceToken(token, BASE_CONTEXT)
  assert.equal(result.ok, true)
  assert.equal(result.ok && result.unitPriceTnd, 150)
})

test("price-token: prix trafiqué dans le payload (signature ne correspond plus) — rejeté", () => {
  const token = signHotelPriceToken({ ...BASE_CONTEXT, unitPriceTnd: 150 })
  const [payloadB64, sig] = token.split(".")
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"))
  payload.unitPriceTnd = 1 // falsification — ramène le prix à 1 TND
  const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  const tamperedToken = `${tamperedPayloadB64}.${sig}`
  const result = verifyHotelPriceToken(tamperedToken, BASE_CONTEXT)
  assert.equal(result.ok, false)
  assert.equal(!result.ok && result.reason, "signature")
})

test("price-token: signature totalement invalide — rejetée", () => {
  const token = signHotelPriceToken({ ...BASE_CONTEXT, unitPriceTnd: 150 })
  const [payloadB64] = token.split(".")
  const forged = `${payloadB64}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`
  const result = verifyHotelPriceToken(forged, BASE_CONTEXT)
  assert.equal(result.ok, false)
  assert.equal(!result.ok && result.reason, "signature")
})

test("price-token: token expiré (issuedAt trop ancien) — rejeté", () => {
  const token = signHotelPriceToken({ ...BASE_CONTEXT, unitPriceTnd: 150 })
  const result = verifyHotelPriceToken(token, BASE_CONTEXT, -1) // TTL négatif → toujours expiré
  assert.equal(result.ok, false)
  assert.equal(!result.ok && result.reason, "expired")
})

test("price-token: réutilisation d'un token valide pour UNE AUTRE chambre — rejeté (mismatch)", () => {
  const token = signHotelPriceToken({ ...BASE_CONTEXT, unitPriceTnd: 150 })
  const result = verifyHotelPriceToken(token, { ...BASE_CONTEXT, roomId: 999 })
  assert.equal(result.ok, false)
  assert.equal(!result.ok && result.reason, "mismatch")
})

test("price-token: réutilisation d'un token valide pour d'AUTRES dates — rejeté (mismatch)", () => {
  const token = signHotelPriceToken({ ...BASE_CONTEXT, unitPriceTnd: 150 })
  const result = verifyHotelPriceToken(token, { ...BASE_CONTEXT, checkin: "2026-08-01", checkout: "2026-08-06" })
  assert.equal(result.ok, false)
  assert.equal(!result.ok && result.reason, "mismatch")
})

test("price-token: token absent/vide — rejeté (malformed), jamais une exception", () => {
  assert.equal(verifyHotelPriceToken(undefined, BASE_CONTEXT).ok, false)
  assert.equal(verifyHotelPriceToken(null, BASE_CONTEXT).ok, false)
  assert.equal(verifyHotelPriceToken("", BASE_CONTEXT).ok, false)
  assert.equal(verifyHotelPriceToken("not-a-valid-token", BASE_CONTEXT).ok, false)
})

test("signHotelSearchOffersInPlace: ajoute un priceToken par chambre, revérifiable avec le prix unitaire exact", () => {
  const dto = {
    offers: [
      {
        hotel: { id: 42 },
        currency: "TND",
        boardings: [
          {
            id: 3,
            pax: [
              {
                adult: 2,
                rooms: [{ id: 7, price: 300 }], // prix TOTAL pour 2 adultes
              },
            ],
          },
        ],
      },
    ],
  }
  signHotelSearchOffersInPlace(dto, { checkin: "2026-07-15", checkout: "2026-07-20" })
  const room = dto.offers[0].boardings[0].pax[0].rooms[0] as { priceToken?: string }
  assert.ok(room.priceToken)
  const result = verifyHotelPriceToken(room.priceToken, BASE_CONTEXT)
  assert.equal(result.ok, true)
  // room.price (300) est le TOTAL pour 2 adultes → unitPriceTnd signé = 150
  assert.equal(result.ok && result.unitPriceTnd, 150)
})

test("resolveDraftHotelPrice: module non-hôtel — jamais de vérification, passthrough de draft.unitPriceTnd", () => {
  const resolved = resolveDraftHotelPrice({
    module: "flight",
    unitPriceTnd: 999,
    startDate: "2026-07-15",
    adults: 2,
    currency: "TND",
  })
  assert.equal(resolved.verified, false)
  assert.equal(resolved.reason, "not_hotel")
  assert.equal(resolved.unitPriceTnd, 999)
})

test("resolveDraftHotelPrice: module hôtel sans priceToken dans metadata — non vérifié", () => {
  const resolved = resolveDraftHotelPrice({
    module: "hotel",
    unitPriceTnd: 1, // valeur falsifiée par un client
    startDate: "2026-07-15",
    endDate: "2026-07-20",
    adults: 2,
    currency: "TND",
    metadata: { hotelId: 42, roomId: 7, boardingId: 3 },
  })
  assert.equal(resolved.verified, false)
  assert.equal(resolved.reason, "no_token")
})

test("resolveDraftHotelPrice: module hôtel avec priceToken valide — retourne le prix serveur, jamais celui du draft", () => {
  const token = signHotelPriceToken({ ...BASE_CONTEXT, unitPriceTnd: 150 })
  const resolved = resolveDraftHotelPrice({
    module: "hotel",
    unitPriceTnd: 1, // le client a falsifié cette valeur dans le brouillon
    startDate: BASE_CONTEXT.checkin,
    endDate: BASE_CONTEXT.checkout,
    adults: BASE_CONTEXT.adults,
    currency: BASE_CONTEXT.currency,
    metadata: {
      hotelId: BASE_CONTEXT.hotelId,
      roomId: BASE_CONTEXT.roomId,
      boardingId: BASE_CONTEXT.boardingId,
      priceToken: token,
    },
  })
  assert.equal(resolved.verified, true)
  assert.equal(resolved.unitPriceTnd, 150)
})

test("resolveDraftHotelPrice: priceToken d'une AUTRE chambre injecté dans le draft trafiqué — rejeté (mismatch), jamais accepté", () => {
  // Le token est authentique (signé serveur) mais pour une chambre moins chère
  // que celle réellement décrite par le reste du brouillon (roomId différent)
  // — reproduit le scénario "attaquant copie un vrai token d'une offre bon
  // marché sur un draft pointant vers une offre plus chère".
  const cheapToken = signHotelPriceToken({ ...BASE_CONTEXT, roomId: 1, unitPriceTnd: 10 })
  const resolved = resolveDraftHotelPrice({
    module: "hotel",
    unitPriceTnd: 10,
    startDate: BASE_CONTEXT.checkin,
    endDate: BASE_CONTEXT.checkout,
    adults: BASE_CONTEXT.adults,
    currency: BASE_CONTEXT.currency,
    metadata: {
      hotelId: BASE_CONTEXT.hotelId,
      roomId: BASE_CONTEXT.roomId, // chambre réellement visée par le draft — DIFFÉRENTE du token
      boardingId: BASE_CONTEXT.boardingId,
      priceToken: cheapToken,
    },
  })
  assert.equal(resolved.verified, false)
  assert.equal(resolved.reason, "mismatch")
})
