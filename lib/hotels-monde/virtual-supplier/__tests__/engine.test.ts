/**
 * Tests du Virtual World Hotel Supplier — appelle l'engine directement (pas
 * de couche HTTP simulée, voir engine.ts en tête de fichier).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { search, book, cancel } from "../engine"
import { resetInventory } from "../inventory-store"
import { setScenario, resetScenario } from "../scenarios"
import { validateOfferToken } from "../tokens"

function reset() {
  resetScenario()
  resetInventory()
}

const BASE_INPUT = {
  destination: "istanbul",
  city: "Istanbul",
  checkIn: "2026-12-01",
  checkOut: "2026-12-05",
  nights: 4,
  adults: 2,
  rooms: 1,
}

test("search: déterministe — même destination/dates => mêmes offerIds", () => {
  reset()
  const a = search(BASE_INPUT)
  const b = search(BASE_INPUT)
  assert.deepEqual(
    a.offers.map((o) => o.offerId),
    b.offers.map((o) => o.offerId),
  )
})

test("search: 3 à 6 offres, triées par prix/nuit croissant, prix total = pricePerNight x nights x rooms", () => {
  reset()
  const { offers } = search(BASE_INPUT)
  assert.ok(offers.length >= 3 && offers.length <= 6)
  for (let i = 1; i < offers.length; i++) {
    assert.ok(offers[i]!.pricePerNightTnd >= offers[i - 1]!.pricePerNightTnd)
  }
  for (const o of offers) {
    assert.equal(o.totalPriceTnd, o.pricePerNightTnd * BASE_INPUT.nights * BASE_INPUT.rooms)
  }
})

test("search: destination différente => offres différentes (pas des fixtures statiques)", () => {
  reset()
  const a = search(BASE_INPUT)
  const b = search({ ...BASE_INPUT, destination: "paris", city: "Paris" })
  assert.notDeepEqual(
    a.offers.map((o) => o.offerId),
    b.offers.map((o) => o.offerId),
  )
})

test("search: filtre stars => toutes les offres retournées respectent le filtre", () => {
  reset()
  const { offers } = search({ ...BASE_INPUT, stars: 5 })
  assert.ok(offers.length >= 1)
  assert.ok(offers.every((o) => o.stars === 5))
})

test("search: chaque offre porte un token signé valide, cohérent avec l'offre", () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers[0]!
  const validated = validateOfferToken(offer.token)
  assert.equal(validated.ok, true)
  if (validated.ok) {
    assert.equal(validated.payload.offerId, offer.offerId)
    assert.equal(validated.payload.destination, "istanbul")
    assert.equal(validated.payload.totalPriceTnd, offer.totalPriceTnd)
  }
})

test("book: succès (NORMAL) — numéro de confirmation émis, prix cohérent avec la recherche", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers.find((o) => o.availableRooms >= 1)!
  const result = await book(offer.token, offer.totalPriceTnd)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.ok(result.confirmationNumber.startsWith("WH-"))
    assert.equal(result.confirmationNumber.length, 11)
    assert.equal(result.totalPriceTnd, offer.totalPriceTnd)
    assert.equal(result.rooms, 1)
    assert.equal(result.nights, 4)
  }
})

test("book: décrémente réellement l'inventaire (disponibilité baisse après réservation)", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers.find((o) => o.availableRooms >= 1)!
  const before = offer.availableRooms

  await book(offer.token, offer.totalPriceTnd)

  const after = search(BASE_INPUT).offers.find((o) => o.offerId === offer.offerId)!
  assert.equal(after.availableRooms, before - 1, "1 chambre (rooms) décrémentée")
})

test("cancel: restitue l'inventaire réservé par book()", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers.find((o) => o.availableRooms >= 1)!
  const before = offer.availableRooms

  const booked = await book(offer.token, offer.totalPriceTnd)
  assert.ok(booked.ok)
  if (!booked.ok) return

  await cancel({ offerId: booked.offerId, checkIn: booked.checkIn, rooms: booked.rooms })

  const after = search(BASE_INPUT).offers.find((o) => o.offerId === offer.offerId)!
  assert.equal(after.availableRooms, before, "inventaire restitué après annulation")
})

test("SÉCURITÉ — book: jeton altéré (signature invalide) => TOKEN_INVALID", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers[0]!
  const tampered = offer.token.slice(0, -3) + "xyz"
  const result = await book(tampered, offer.totalPriceTnd)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.kind, "TOKEN_INVALID")
})

test("SÉCURITÉ — book: jeton malformé (pas 2 segments) => TOKEN_INVALID", async () => {
  reset()
  const result = await book("not-a-real-token", 100)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.kind, "TOKEN_INVALID")
})

test("SÉCURITÉ — book: prix client != prix serveur recalculé => rejeté (jamais un prix client de confiance)", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers[0]!
  const result = await book(offer.token, offer.totalPriceTnd - 1)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.kind, "PRICE_CHANGED")
})

test("scénario SOLD_OUT: book échoue proprement, aucune décrémentation appliquée", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers[0]!
  setScenario("SOLD_OUT")
  const result = await book(offer.token, offer.totalPriceTnd)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.kind, "SOLD_OUT")
  resetScenario()
  const after = search(BASE_INPUT).offers.find((o) => o.offerId === offer.offerId)!
  assert.equal(after.availableRooms, offer.availableRooms, "inventaire inchangé — jamais décrémenté sur un échec")
})

test("scénario PRICE_CHANGED: prix serveur recalculé +12%, currentPriceTnd renvoyé pour ré-affichage", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers[0]!
  setScenario("PRICE_CHANGED")
  const result = await book(offer.token, offer.totalPriceTnd)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.kind, "PRICE_CHANGED")
    assert.equal(result.currentPriceTnd, Math.round(offer.totalPriceTnd * 1.12))
  }
  resetScenario()
})

test("scénario BOOKING_REJECTED: fournisseur refuse explicitement, aucune confirmation émise", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers[0]!
  setScenario("BOOKING_REJECTED")
  const result = await book(offer.token, offer.totalPriceTnd)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.kind, "BOOKING_REJECTED")
  resetScenario()
})

test("scénario TIMEOUT: le fournisseur ne répond pas — kind TIMEOUT après le délai simulé", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers[0]!
  setScenario("TIMEOUT")
  const start = Date.now()
  const result = await book(offer.token, offer.totalPriceTnd)
  const elapsed = Date.now() - start
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.kind, "TIMEOUT")
  assert.ok(elapsed >= 2900, "doit réellement attendre le délai simulé, pas un timeout instantané fabriqué")
  resetScenario()
})
