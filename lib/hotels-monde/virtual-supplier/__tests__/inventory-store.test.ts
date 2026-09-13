/**
 * Concurrence de l'inventaire hôtels monde — même risque que
 * lib/vols/virtual-supplier/__tests__/inventory-store.test.ts : un
 * check-then-decrement sans verrouillage laisse passer un double-booking
 * dès qu'un `await` sépare les deux étapes.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { reserve, release, currentAvailability, resetInventory } from "../inventory-store"

const KEY = "istanbul-2026-12-01-grand-palace:2026-12-01"

test("reserve: échoue proprement quand la disponibilité est à 0", async () => {
  resetInventory()
  const avail = currentAvailability(KEY)
  for (let i = 0; i < avail; i++) {
    const ok = await reserve(KEY, 1)
    assert.equal(ok, true)
  }
  assert.equal(currentAvailability(KEY), 0)
  const overbook = await reserve(KEY, 1)
  assert.equal(overbook, false)
})

test("release: restitue exactement ce qui a été réservé", async () => {
  resetInventory()
  const before = currentAvailability(KEY)
  await reserve(KEY, 1)
  assert.equal(currentAvailability(KEY), before - 1)
  await release(KEY, 1)
  assert.equal(currentAvailability(KEY), before)
})

test("SÉCURITÉ — CONCURRENCE : dernière chambre (inventaire=1), deux réservations simultanées => une seule réussit", async () => {
  resetInventory()
  let avail = currentAvailability(KEY)
  while (avail > 1) {
    await reserve(KEY, 1)
    avail = currentAvailability(KEY)
  }
  assert.equal(avail, 1)

  const [a, b] = await Promise.all([reserve(KEY, 1), reserve(KEY, 1)])
  const successes = [a, b].filter(Boolean).length
  assert.equal(successes, 1, "exactement un gagnant sur la dernière chambre")
  assert.equal(currentAvailability(KEY), 0)
})

test("SÉCURITÉ — CONCURRENCE : 10 tentatives simultanées sur 1 chambre => exactement 1 succès, 9 échecs, jamais négatif", async () => {
  resetInventory()
  let avail = currentAvailability(KEY)
  while (avail > 1) {
    await reserve(KEY, 1)
    avail = currentAvailability(KEY)
  }

  const attempts = await Promise.all(Array.from({ length: 10 }, () => reserve(KEY, 1)))
  const successes = attempts.filter(Boolean).length
  const failures = attempts.filter((r) => !r).length
  assert.equal(successes, 1)
  assert.equal(failures, 9)
  assert.ok(currentAvailability(KEY) >= 0, "jamais négatif")
})

test("disponibilité déterministe: même clé => même valeur de base entre deux appels", () => {
  resetInventory()
  const a = currentAvailability("paris-2027-01-15-city-center-hotel:2027-01-15")
  const b = currentAvailability("paris-2027-01-15-city-center-hotel:2027-01-15")
  assert.equal(a, b)
})
