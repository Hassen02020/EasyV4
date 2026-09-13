/**
 * Tests du Virtual Flight Supplier — appelle l'engine directement (pas de
 * couche HTTP simulée pour les vols, voir engine.ts en tête de fichier).
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
  origin: "TUN",
  destination: "CDG",
  departureDate: "2026-12-01",
  adults: 2,
  children: 0,
  cabin: "ECONOMY" as const,
}

test("search: déterministe — même route/date/cabine => mêmes offerIds", () => {
  reset()
  const a = search(BASE_INPUT)
  const b = search(BASE_INPUT)
  assert.deepEqual(
    a.offers.map((o) => o.offerId),
    b.offers.map((o) => o.offerId),
  )
})

test("search: 3 à 5 offres, triées par prix croissant, prix = unitPrice x (adults+children)", () => {
  reset()
  const { offers } = search(BASE_INPUT)
  assert.ok(offers.length >= 3 && offers.length <= 5)
  for (let i = 1; i < offers.length; i++) {
    assert.ok(offers[i]!.priceTnd >= offers[i - 1]!.priceTnd)
  }
  assert.ok(offers.every((o) => o.priceTnd > 0))
})

test("search: route différente => offres différentes (pas des fixtures statiques)", () => {
  reset()
  const a = search(BASE_INPUT)
  const b = search({ ...BASE_INPUT, destination: "IST" })
  assert.notDeepEqual(
    a.offers.map((o) => o.offerId),
    b.offers.map((o) => o.offerId),
  )
})

test("search: chaque offre porte un token signé valide, cohérent avec l'offre", () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers[0]!
  const validated = validateOfferToken(offer.token)
  assert.equal(validated.ok, true)
  if (validated.ok) {
    assert.equal(validated.payload.offerId, offer.offerId)
    assert.equal(validated.payload.origin, "TUN")
    assert.equal(validated.payload.destination, "CDG")
    assert.equal(validated.payload.priceTnd, offer.priceTnd)
  }
})

test("book: succès (NORMAL) — PNR émis, segments retournés, prix cohérent avec la recherche", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  // 2 adultes => il faut une offre avec au moins 2 places ; offers[0] (moins
  // chère) peut tomber sur une offre LIMITED/SOLD_OUT (distribution réaliste
  // de l'inventaire, voir inventory-store.ts) — ce test vérifie le succès
  // NORMAL, pas la disponibilité elle-même (couverte par les tests dédiés).
  const offer = offers.find((o) => o.availableSeats >= 2)!
  const result = await book(offer.token, offer.priceTnd)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.pnr.length, 6)
    assert.ok(result.segments.length >= 1)
    assert.equal(result.totalPriceTnd, offer.priceTnd)
    assert.equal(result.adults, 2)
    assert.equal(result.children, 0)
  }
})

test("book: décrémente réellement l'inventaire (disponibilité baisse après réservation)", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers.find((o) => o.availableSeats >= 2)!
  const before = offer.availableSeats

  await book(offer.token, offer.priceTnd)

  const after = search(BASE_INPUT).offers.find((o) => o.offerId === offer.offerId)!
  assert.equal(after.availableSeats, before - 2, "2 sièges (adults) décrémentés")
})

test("cancel: restitue l'inventaire réservé par book()", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers.find((o) => o.availableSeats >= 2)!
  const before = offer.availableSeats

  const booked = await book(offer.token, offer.priceTnd)
  assert.ok(booked.ok)
  if (!booked.ok) return

  await cancel({
    offerId: booked.offerId,
    departureDate: booked.departureDate,
    adults: booked.adults,
    children: booked.children,
  })

  const after = search(BASE_INPUT).offers.find((o) => o.offerId === offer.offerId)!
  assert.equal(after.availableSeats, before, "inventaire restitué après annulation")
})

test("SÉCURITÉ — book: jeton altéré (signature invalide) => TOKEN_INVALID", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers[0]!
  const tampered = offer.token.slice(0, -3) + "xyz"
  const result = await book(tampered, offer.priceTnd)
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
  const result = await book(offer.token, offer.priceTnd - 1)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.kind, "PRICE_CHANGED")
})

test("scénario SOLD_OUT: book échoue proprement, aucune décrémentation appliquée", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers[0]!
  setScenario("SOLD_OUT")
  const result = await book(offer.token, offer.priceTnd)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.kind, "SOLD_OUT")
  resetScenario()
  const after = search(BASE_INPUT).offers.find((o) => o.offerId === offer.offerId)!
  assert.equal(after.availableSeats, offer.availableSeats, "inventaire inchangé — jamais décrémenté sur un échec")
})

test("scénario PRICE_CHANGED: prix serveur recalculé +12%, currentPriceTnd renvoyé pour ré-affichage", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers[0]!
  setScenario("PRICE_CHANGED")
  const result = await book(offer.token, offer.priceTnd)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.kind, "PRICE_CHANGED")
    assert.equal(result.currentPriceTnd, Math.round(offer.priceTnd * 1.12))
  }
  resetScenario()
})

test("scénario BOOKING_REJECTED: fournisseur refuse explicitement, aucun PNR émis", async () => {
  reset()
  const { offers } = search(BASE_INPUT)
  const offer = offers[0]!
  setScenario("BOOKING_REJECTED")
  const result = await book(offer.token, offer.priceTnd)
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
  const result = await book(offer.token, offer.priceTnd)
  const elapsed = Date.now() - start
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.kind, "TIMEOUT")
  assert.ok(elapsed >= 2900, "doit réellement attendre le délai simulé, pas un timeout instantané fabriqué")
  resetScenario()
})
