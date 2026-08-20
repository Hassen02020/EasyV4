import test from "node:test"
import assert from "node:assert/strict"
import type { BookingDraft, TravelerInput } from "../schemas"
import {
  authoritativeUnitPrice,
  buildMyGoBookingRequest,
  extractHotelProviderMetadata,
} from "../hotel-provider-booking"

const traveler: TravelerInput = {
  civility: "M",
  firstName: "Ahmed",
  lastName: "Ben Salah",
  email: "ahmed@example.tn",
  phone: "+216 98 140 514",
  civicIdType: "cin",
  civicId: "12345678",
}

const baseDraft: BookingDraft = {
  module: "hotel",
  offerId: "646",
  offerLabel: "Yocca Hotel Residence — Chambre Double",
  startDate: "2026-09-10",
  endDate: "2026-09-13",
  adults: 1,
  children: 0,
  unitPriceTnd: 651,
  currency: "TND",
  metadata: {
    myGoToken: "tok-abc123",
    cityId: 10,
    hotelId: 646,
    boardingId: 5,
    boardingCode: "DP",
    roomId: 5521,
    childrenAges: [],
  },
}

test("extractHotelProviderMetadata: metadata myGo complète → objet validé", () => {
  const meta = extractHotelProviderMetadata(baseDraft.metadata)
  assert.ok(meta)
  assert.equal(meta!.myGoToken, "tok-abc123")
  assert.equal(meta!.cityId, 10)
  assert.equal(meta!.roomId, 5521)
})

test("extractHotelProviderMetadata: metadata absente → null (offre démo)", () => {
  assert.equal(extractHotelProviderMetadata(undefined), null)
  assert.equal(
    extractHotelProviderMetadata({ hotelImage: "x.jpg", mealPlan: "DP" }),
    null,
  )
})

test("extractHotelProviderMetadata: champs requis manquants → null", () => {
  const incomplete = { ...(baseDraft.metadata as Record<string, unknown>) }
  delete incomplete.myGoToken
  assert.equal(extractHotelProviderMetadata(incomplete), null)
})

test("buildMyGoBookingRequest: voyageur principal = Holder avec sa vraie identité", () => {
  const meta = extractHotelProviderMetadata(baseDraft.metadata)!
  const req = buildMyGoBookingRequest({ draft: baseDraft, traveler, providerMeta: meta })
  assert.equal(req.token, "tok-abc123")
  assert.equal(req.cityId, 10)
  assert.equal(req.hotelId, 646)
  assert.equal(req.checkIn, "2026-09-10")
  assert.equal(req.checkOut, "2026-09-13")
  assert.equal(req.rooms.length, 1)
  const room = req.rooms[0]!
  assert.equal(room.roomId, 5521)
  assert.equal(room.boardingId, 5)
  assert.equal(room.adults.length, 1)
  const holder = room.adults[0]!
  assert.equal(holder.holder, true)
  assert.equal(holder.name, "Ahmed")
  assert.equal(holder.surname, "Ben Salah")
  assert.equal(holder.civility, "M")
  assert.equal(room.children, undefined)
})

test("buildMyGoBookingRequest: adultes additionnels génériques, non-Holder", () => {
  const draft: BookingDraft = { ...baseDraft, adults: 3 }
  const meta = extractHotelProviderMetadata(baseDraft.metadata)!
  const req = buildMyGoBookingRequest({ draft, traveler, providerMeta: meta })
  const adults = req.rooms[0]!.adults
  assert.equal(adults.length, 3)
  assert.equal(adults[0]!.holder, true)
  assert.equal(adults[1]!.holder, false)
  assert.equal(adults[1]!.surname, "Ben Salah")
  assert.equal(adults[2]!.holder, false)
  assert.notEqual(adults[1]!.name, adults[2]!.name)
})

test("buildMyGoBookingRequest: âges enfants réels repris depuis les métadonnées", () => {
  const draft: BookingDraft = { ...baseDraft, children: 2 }
  const metaRaw = { ...(baseDraft.metadata as Record<string, unknown>), childrenAges: [5, 9] }
  const meta = extractHotelProviderMetadata(metaRaw)!
  const req = buildMyGoBookingRequest({ draft, traveler, providerMeta: meta })
  const children = req.rooms[0]!.children!
  assert.equal(children.length, 2)
  assert.equal(children[0]!.age, 5)
  assert.equal(children[1]!.age, 9)
  assert.equal(children[0]!.surname, "Ben Salah")
})

test("buildMyGoBookingRequest: âge par défaut si liste d'âges plus courte que le nombre d'enfants", () => {
  const draft: BookingDraft = { ...baseDraft, children: 2 }
  const metaRaw = { ...(baseDraft.metadata as Record<string, unknown>), childrenAges: [7] }
  const meta = extractHotelProviderMetadata(metaRaw)!
  const req = buildMyGoBookingRequest({ draft, traveler, providerMeta: meta })
  const children = req.rooms[0]!.children!
  assert.equal(children[0]!.age, 7)
  assert.equal(children[1]!.age, 10) // fallback
})

test("buildMyGoBookingRequest: hotelId retombe sur draft.offerId si absent des métadonnées", () => {
  const metaRaw = { ...(baseDraft.metadata as Record<string, unknown>) }
  delete metaRaw.hotelId
  const meta = extractHotelProviderMetadata(metaRaw)!
  const req = buildMyGoBookingRequest({ draft: baseDraft, traveler, providerMeta: meta })
  assert.equal(req.hotelId, 646) // Number(draft.offerId)
})

test("authoritativeUnitPrice: répartit le total myGo sur les adultes, enfants à 0", () => {
  const r = authoritativeUnitPrice(651, 3)
  assert.equal(r.unitPriceTnd, 217)
  assert.equal(r.unitChildPriceTnd, 0)
})

test("authoritativeUnitPrice: protège contre adults=0", () => {
  const r = authoritativeUnitPrice(500, 0)
  assert.equal(r.unitPriceTnd, 500)
})
