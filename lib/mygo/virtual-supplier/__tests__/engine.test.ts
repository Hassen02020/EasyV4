/**
 * Tests du Virtual MyGo Supplier — appellent l'engine directement (pas de
 * HTTP ici, voir __tests__/inventory-store.test.ts pour la concurrence et
 * scripts d'intégration pour le chemin HTTP complet via MyGoClient réel).
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  ListCityResponse,
  ListBoardingResponse,
  HotelSearchResponse,
  BookingCreationResponse,
  BookingCancellationResponse,
  BookingListResponse,
} from "../../schemas"
import {
  handleListCity,
  handleListBoarding,
  handleHotelSearch,
  handleBookingCreation,
  handleBookingCancellation,
  handleBookingList,
} from "../engine"
import { resetInventory } from "../inventory-store"
import { resetLedger } from "../booking-ledger"
import { resetCatalog, getCatalog } from "../catalog"
import { setScenario, resetScenario } from "../scenarios"

function reset() {
  resetScenario()
  resetInventory()
  resetLedger()
  resetCatalog()
}

const CRED = { Credential: { Login: "t", Password: "t" } }

test("handleListCity: le VRAI schéma Zod valide la réponse virtuelle sans modification", () => {
  const raw = handleListCity()
  const parsed = ListCityResponse.parse(raw)
  assert.ok(parsed.ListCity && parsed.ListCity.length >= 30)
})

test("handleListBoarding: le VRAI schéma Zod valide la réponse virtuelle", () => {
  const raw = handleListBoarding()
  const parsed = ListBoardingResponse.parse(raw)
  assert.ok(parsed.ListBoarding && parsed.ListBoarding.length === 5)
})

test("catalogue: au moins 50 hôtels, déterministe entre deux générations", () => {
  reset()
  const a = getCatalog()
  resetCatalog()
  const b = getCatalog()
  assert.ok(a.length >= 50)
  assert.deepEqual(
    a.map((h) => h.id),
    b.map((h) => h.id),
    "même seed => même catalogue",
  )
})

function searchHammamet(checkIn = "2026-09-10", checkOut = "2026-09-13") {
  return handleHotelSearch({
    ...CRED,
    SearchDetails: {
      BookingDetails: { City: 10, CheckIn: checkIn, CheckOut: checkOut },
      Filters: { OnlyAvailable: true },
      Rooms: [{ Adult: 2, Child: [] }],
    },
  })
}

test("HotelSearch: le VRAI schéma Zod valide la réponse, prix calculé (pas codé en dur)", () => {
  reset()
  const raw = searchHammamet()
  const parsed = HotelSearchResponse.parse(raw)
  assert.ok(parsed.HotelSearch && parsed.HotelSearch.length > 0, "des hôtels à Hammamet")
  const first = parsed.HotelSearch![0]!
  assert.ok(first.Token.length > 10)
  const room = first.Price.Boarding[0]!.Pax[0]!.Rooms[0]!
  assert.ok(room.Price > 0)
  // 3 nuits doit coûter ~3x plus qu'une nuit pour la même chambre/boarding — pas un prix fixe.
  const oneNight = HotelSearchResponse.parse(searchHammamet("2026-09-10", "2026-09-11"))
    .HotelSearch![0]!.Price.Boarding[0]!.Pax[0]!.Rooms[0]!.Price
  assert.ok(Math.abs(room.Price - oneNight * 3) < 0.01)
})

test("SÉCURITÉ — HotelSearch: NO_AVAILABILITY scenario => aucune chambre réservable renvoyée", () => {
  reset()
  setScenario("NO_AVAILABILITY")
  const parsed = HotelSearchResponse.parse(searchHammamet())
  const hasBookableRoom = (parsed.HotelSearch ?? []).some((h) =>
    h.Price.Boarding.some((b) => b.Pax.some((p) => p.Rooms.length > 0)),
  )
  assert.equal(hasBookableRoom, false)
})

function extractFirstOffer() {
  const parsed = HotelSearchResponse.parse(searchHammamet())
  const offer = parsed.HotelSearch!.find((h) =>
    h.Price.Boarding.some((b) => b.Pax.some((p) => p.Rooms.length > 0)),
  )!
  const boarding = offer.Price.Boarding.find((b) => b.Pax.some((p) => p.Rooms.length > 0))!
  const room = boarding.Pax[0]!.Rooms[0]!
  return { hotelId: offer.Hotel.Id, token: offer.Token, boardingId: boarding.Id, roomId: room.Id }
}

function bookingRequest(over: Partial<ReturnType<typeof extractFirstOffer>> = {}) {
  const offer = { ...extractFirstOffer(), ...over }
  return {
    ...CRED,
    HotelBooking: {
      Token: offer.token,
      City: 10,
      Hotel: offer.hotelId,
      CheckIn: "2026-09-10",
      CheckOut: "2026-09-13",
      Rooms: [
        {
          Id: offer.roomId,
          Boarding: offer.boardingId,
          Pax: {
            Adult: [{ Civility: "M", Name: "Test", Surname: "User", Holder: true }],
            Child: [],
          },
        },
      ],
    },
  }
}

test("BookingCreation: succès — le VRAI schéma valide, TotalPrice > 0, State Validated", async () => {
  reset()
  const result = await handleBookingCreation(bookingRequest())
  const parsed = BookingCreationResponse.parse(result.json)
  assert.equal(parsed.State, "Validated")
  assert.ok((parsed.TotalPrice ?? 0) > 0)
  assert.equal(parsed.Currency, "TND")
})

test("SÉCURITÉ — BookingCreation: token d'une autre recherche (autre hôtel) => rejeté", async () => {
  reset()
  const offer = extractFirstOffer()
  const otherHotel = getCatalog().find((h) => h.id !== offer.hotelId)!
  const req = bookingRequest({ hotelId: otherHotel.id })
  const result = await handleBookingCreation(req)
  const parsed = BookingCreationResponse.parse(result.json)
  assert.ok(parsed.ErrorMessage && !Array.isArray(parsed.ErrorMessage))
})

test("SÉCURITÉ — BookingCreation: token altéré (signature invalide) => rejeté", async () => {
  reset()
  const offer = extractFirstOffer()
  const tampered = offer.token.slice(0, -3) + "xyz"
  const req = bookingRequest({ token: tampered })
  const result = await handleBookingCreation(req)
  const parsed = BookingCreationResponse.parse(result.json)
  assert.ok(parsed.ErrorMessage && !Array.isArray(parsed.ErrorMessage))
})

test("BookingCreation: scénario CURRENCY_MISMATCH => Currency confirmée != TND", async () => {
  reset()
  setScenario("CURRENCY_MISMATCH")
  const result = await handleBookingCreation(bookingRequest())
  const parsed = BookingCreationResponse.parse(result.json)
  assert.notEqual(parsed.Currency, "TND")
})

test("BookingCreation: scénario HOTEL_ID_MISMATCH => Hotel.Id confirmé != attendu", async () => {
  reset()
  const offer = extractFirstOffer()
  setScenario("HOTEL_ID_MISMATCH")
  const result = await handleBookingCreation(bookingRequest())
  const parsed = BookingCreationResponse.parse(result.json)
  assert.notEqual(parsed.Hotel?.Id, offer.hotelId)
})

test("BookingCreation: scénario MALFORMED_RESPONSE => échoue le VRAI schéma Zod (TotalPrice manquant)", async () => {
  reset()
  setScenario("MALFORMED_RESPONSE")
  const result = await handleBookingCreation(bookingRequest())
  const parsed = BookingCreationResponse.safeParse(result.json)
  // TotalPrice est requis (non optional) dans BookingCreationResponse -> échec attendu.
  assert.equal(parsed.success, false)
})

test("Cycle complet: BookingCreation décrémente l'inventaire, BookingCancellation le restitue", async () => {
  reset()
  const offer = extractFirstOffer()
  const before = HotelSearchResponse.parse(searchHammamet())
    .HotelSearch!.find((h) => h.Hotel.Id === offer.hotelId)!
    .Price.Boarding.find((b) => b.Id === offer.boardingId)!
    .Pax[0]!.Rooms.find((r) => r.Id === offer.roomId)!.Quantity as number

  const created = await handleBookingCreation(bookingRequest(offer))
  const bookingId = BookingCreationResponse.parse(created.json).Id!

  const afterBooking = HotelSearchResponse.parse(searchHammamet())
    .HotelSearch!.find((h) => h.Hotel.Id === offer.hotelId)!
    .Price.Boarding.find((b) => b.Id === offer.boardingId)!
    .Pax[0]!.Rooms.find((r) => r.Id === offer.roomId)?.Quantity as number | undefined

  assert.equal((afterBooking ?? 0), before - 1, "inventaire décrémenté de 1")

  const cancelled = await handleBookingCancellation({ ...CRED, Booking: bookingId })
  const cancelParsed = BookingCancellationResponse.parse(cancelled.json)
  assert.ok(cancelParsed.Cancelled)

  const afterCancel = HotelSearchResponse.parse(searchHammamet())
    .HotelSearch!.find((h) => h.Hotel.Id === offer.hotelId)!
    .Price.Boarding.find((b) => b.Id === offer.boardingId)!
    .Pax[0]!.Rooms.find((r) => r.Id === offer.roomId)?.Quantity as number | undefined
  assert.equal((afterCancel ?? 0), before, "inventaire restitué après annulation")
})

test("SÉCURITÉ — BookingCancellation: MyGo rejette => la réservation reste Validated côté ledger", async () => {
  reset()
  const created = await handleBookingCreation(bookingRequest())
  const bookingId = BookingCreationResponse.parse(created.json).Id!

  setScenario("CANCEL_FAILED")
  const cancelled = await handleBookingCancellation({ ...CRED, Booking: bookingId })
  const parsed = BookingCancellationResponse.parse(cancelled.json)
  assert.ok(parsed.ErrorMessage && !Array.isArray(parsed.ErrorMessage))

  resetScenario()
  const list = handleBookingList({ ...CRED, Filters: { Booking: bookingId } })
  const listParsed = BookingListResponse.parse(list)
  assert.equal(listParsed.BookingDetail![0]!.State, "Validated", "toujours active — pas annulée")
})

test("BookingCancellation: annuler une résa déjà annulée est idempotent (Fee=0 la 2e fois)", async () => {
  reset()
  const created = await handleBookingCreation(bookingRequest())
  const bookingId = BookingCreationResponse.parse(created.json).Id!
  await handleBookingCancellation({ ...CRED, Booking: bookingId })
  const second = await handleBookingCancellation({ ...CRED, Booking: bookingId })
  const parsed = BookingCancellationResponse.parse(second.json)
  assert.equal(parsed.Fee, 0)
})

test("TIMEOUT_AFTER_ACCEPT: la réservation existe réellement (retrouvable via ListBookings) malgré la réponse retardée", async () => {
  reset()
  const offer = extractFirstOffer()
  setScenario("TIMEOUT_AFTER_ACCEPT")
  const result = await handleBookingCreation(bookingRequest(offer))
  assert.ok(result.delayMs && result.delayMs > 0)
  const id = (result.json as { Id?: number }).Id!
  resetScenario()
  const list = handleBookingList({ ...CRED, Filters: { Hotel: offer.hotelId } })
  const parsed = BookingListResponse.parse(list)
  assert.ok(parsed.BookingDetail!.some((b) => b.Id === id))
})

test("TIMEOUT (simple): aucune réservation n'a été créée — réconciliation doit rester bredouille", async () => {
  reset()
  const offer = extractFirstOffer()
  setScenario("TIMEOUT")
  const result = await handleBookingCreation(bookingRequest(offer))
  assert.deepEqual(result.json, {})
  resetScenario()
  const list = handleBookingList({ ...CRED, Filters: { Hotel: offer.hotelId } })
  const parsed = BookingListResponse.parse(list)
  assert.equal(parsed.BookingDetail?.length ?? 0, 0)
})

test("TWO_PLAUSIBLE_CANDIDATES: deux réservations plausibles apparaissent dans ListBookings", async () => {
  reset()
  const offer = extractFirstOffer()
  setScenario("TWO_PLAUSIBLE_CANDIDATES")
  await handleBookingCreation(bookingRequest(offer))
  resetScenario()
  const list = handleBookingList({ ...CRED, Filters: { Hotel: offer.hotelId } })
  const parsed = BookingListResponse.parse(list)
  assert.equal(parsed.BookingDetail?.length, 2, "deux candidats plausibles — l'appelant ne doit PAS deviner")
})
