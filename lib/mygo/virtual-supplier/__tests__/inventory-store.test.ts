/**
 * Concurrence de l'inventaire (items 6, 25 du cahier des charges) — le
 * point le plus facile à faire "marcher sur la doc mais casser en vrai" :
 * un check-then-decrement sans verrouillage laisse passer un double-booking
 * dès qu'un `await` sépare les deux étapes, même en Node mono-thread.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { reserve, release, currentAvailability, resetInventory } from "../inventory-store"

const HOTEL = 999001
const ROOM = 999002
const CHECK_IN = "2026-10-01"
const CHECK_OUT = "2026-10-02" // 1 nuit

test("reserve: échoue proprement quand la disponibilité est à 0", async () => {
  resetInventory()
  // Force l'inventaire à 0 en épuisant la disponibilité de base via des réservations successives.
  const avail = currentAvailability(HOTEL, ROOM, CHECK_IN)
  for (let i = 0; i < avail; i++) {
    const r = await reserve(HOTEL, ROOM, CHECK_IN, CHECK_OUT, 1)
    assert.equal(r.ok, true)
  }
  assert.equal(currentAvailability(HOTEL, ROOM, CHECK_IN), 0)
  const overbook = await reserve(HOTEL, ROOM, CHECK_IN, CHECK_OUT, 1)
  assert.equal(overbook.ok, false)
})

test("release: restitue exactement ce qui a été réservé", async () => {
  resetInventory()
  const before = currentAvailability(HOTEL, ROOM, CHECK_IN)
  await reserve(HOTEL, ROOM, CHECK_IN, CHECK_OUT, 1)
  assert.equal(currentAvailability(HOTEL, ROOM, CHECK_IN), before - 1)
  await release(HOTEL, ROOM, CHECK_IN, CHECK_OUT, 1)
  assert.equal(currentAvailability(HOTEL, ROOM, CHECK_IN), before)
})

test("SÉCURITÉ — CONCURRENCE : dernière chambre (inventaire=1), deux réservations simultanées => une seule réussit", async () => {
  resetInventory()
  // Vide l'inventaire jusqu'à exactement 1 chambre restante.
  let avail = currentAvailability(HOTEL, ROOM, CHECK_IN)
  while (avail > 1) {
    await reserve(HOTEL, ROOM, CHECK_IN, CHECK_OUT, 1)
    avail = currentAvailability(HOTEL, ROOM, CHECK_IN)
  }
  assert.equal(avail, 1)

  const [a, b] = await Promise.all([
    reserve(HOTEL, ROOM, CHECK_IN, CHECK_OUT, 1),
    reserve(HOTEL, ROOM, CHECK_IN, CHECK_OUT, 1),
  ])
  const successes = [a, b].filter((r) => r.ok).length
  assert.equal(successes, 1, "exactement un gagnant sur la dernière chambre")
  assert.equal(currentAvailability(HOTEL, ROOM, CHECK_IN), 0)
})

test("SÉCURITÉ — CONCURRENCE : 10 tentatives simultanées sur 1 chambre => exactement 1 succès, 9 échecs, jamais d'inventaire négatif", async () => {
  resetInventory()
  let avail = currentAvailability(HOTEL, ROOM, CHECK_IN)
  while (avail > 1) {
    await reserve(HOTEL, ROOM, CHECK_IN, CHECK_OUT, 1)
    avail = currentAvailability(HOTEL, ROOM, CHECK_IN)
  }

  const attempts = await Promise.all(
    Array.from({ length: 10 }, () => reserve(HOTEL, ROOM, CHECK_IN, CHECK_OUT, 1)),
  )
  const successes = attempts.filter((r) => r.ok).length
  const failures = attempts.filter((r) => !r.ok).length
  assert.equal(successes, 1)
  assert.equal(failures, 9)
  assert.ok(currentAvailability(HOTEL, ROOM, CHECK_IN) >= 0, "jamais négatif")
})

test("reserve: échoue globalement si UNE SEULE nuit du séjour est indisponible (pas de sur-réservation partielle)", async () => {
  resetInventory()
  const checkIn = "2026-11-01"
  const checkOut = "2026-11-04" // 3 nuits
  const middleNight = "2026-11-02"
  // Épuise uniquement la nuit du milieu.
  const avail = currentAvailability(HOTEL, ROOM, middleNight)
  for (let i = 0; i < avail; i++) {
    await reserve(HOTEL, ROOM, middleNight, "2026-11-03", 1)
  }
  assert.equal(currentAvailability(HOTEL, ROOM, middleNight), 0)

  const firstNightBefore = currentAvailability(HOTEL, ROOM, checkIn)
  const result = await reserve(HOTEL, ROOM, checkIn, checkOut, 1)
  assert.equal(result.ok, false)
  // Rollback : la 1ère nuit (qui avait de la dispo) ne doit pas rester décrémentée.
  assert.equal(currentAvailability(HOTEL, ROOM, checkIn), firstNightBefore)
})

test("disponibilité déterministe: même clé hôtel/chambre/date => même valeur de base entre deux appels", () => {
  resetInventory()
  const a = currentAvailability(HOTEL, ROOM, "2027-01-15")
  const b = currentAvailability(HOTEL, ROOM, "2027-01-15")
  assert.equal(a, b)
})
