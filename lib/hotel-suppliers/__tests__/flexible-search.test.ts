/**
 * Tests pour lib/hotel-suppliers/flexible-search.ts (Phase 34).
 *
 * `runFlexibleHotelSearch` est testé en mode démo (pas de MYGO_LOGIN dans
 * cet environnement — voir lib/mygo/__tests__/search-core.test.ts) : même
 * chemin fixture réel que la recherche classique, aucun réseau, aucune
 * donnée inventée par les tests eux-mêmes.
 */

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { HotelSearchQuerySchema } from "../../mygo/search-core"
import {
  generateFlexibleDateCandidates,
  runFlexibleHotelSearch,
  MAX_FLEX_DAYS,
} from "../flexible-search"

const FIXED_NOW = Date.parse("2026-06-01T00:00:00Z")

test("generateFlexibleDateCandidates : flexDays=0 renvoie uniquement la date demandée", () => {
  const candidates = generateFlexibleDateCandidates("2026-09-01", "2026-09-05", 0, {
    nowMs: FIXED_NOW,
  })
  assert.equal(candidates.length, 1)
  assert.deepEqual(candidates[0], {
    checkin: "2026-09-01",
    checkout: "2026-09-05",
    offsetDays: 0,
  })
})

test("generateFlexibleDateCandidates : flexDays=3 renvoie 7 candidats, même durée de séjour partout", () => {
  const candidates = generateFlexibleDateCandidates("2026-09-10", "2026-09-14", 3, {
    nowMs: FIXED_NOW,
  })
  assert.equal(candidates.length, 7)
  assert.deepEqual(
    candidates.map((c) => c.offsetDays),
    [-3, -2, -1, 0, 1, 2, 3],
  )
  for (const c of candidates) {
    const nights =
      (Date.parse(`${c.checkout}T00:00:00Z`) - Date.parse(`${c.checkin}T00:00:00Z`)) /
      86_400_000
    assert.equal(nights, 4, `candidat offset=${c.offsetDays} doit garder 4 nuits`)
  }
  // Le candidat offset=0 doit être EXACTEMENT la date demandée.
  const exact = candidates.find((c) => c.offsetDays === 0)
  assert.deepEqual(exact, { checkin: "2026-09-10", checkout: "2026-09-14", offsetDays: 0 })
})

test("generateFlexibleDateCandidates : flexDays au-delà de MAX_FLEX_DAYS est plafonné", () => {
  const candidates = generateFlexibleDateCandidates("2026-09-10", "2026-09-14", 10, {
    nowMs: FIXED_NOW,
  })
  assert.equal(candidates.length, 2 * MAX_FLEX_DAYS + 1)
})

test("generateFlexibleDateCandidates : exclut les candidats dont l'arrivée tomberait dans le passé", () => {
  // "Aujourd'hui" fixé au 2026-06-01 ; checkin demandé = 2026-06-02 (J+1),
  // donc offset -2/-3 tomberait avant aujourd'hui et doit être exclu.
  const candidates = generateFlexibleDateCandidates("2026-06-02", "2026-06-05", 3, {
    nowMs: FIXED_NOW,
  })
  for (const c of candidates) {
    assert.ok(
      Date.parse(`${c.checkin}T00:00:00Z`) >= FIXED_NOW,
      `candidat ${c.checkin} ne doit jamais être dans le passé`,
    )
  }
  // offsets -3 et -2 auraient donné une arrivée avant aujourd'hui — exclus.
  assert.ok(!candidates.some((c) => c.offsetDays === -3))
})

test("generateFlexibleDateCandidates : dates invalides (checkout <= checkin) → aucun candidat", () => {
  const candidates = generateFlexibleDateCandidates("2026-09-05", "2026-09-01", 2, {
    nowMs: FIXED_NOW,
  })
  assert.deepEqual(candidates, [])
})

test("runFlexibleHotelSearch (démo) : flexDays=0 se comporte comme une recherche classique", async () => {
  const q = HotelSearchQuerySchema.parse({
    cityId: "10",
    checkin: "2026-09-01",
    checkout: "2026-09-05",
    adults: "2",
  })
  const result = await runFlexibleHotelSearch(q, 0)
  assert.equal(result.flexDays, 0)
  assert.equal(result.candidates.length, 1)
  const only = result.candidates[0]!
  assert.equal(only.offsetDays, 0)
  assert.equal(only.ok, true)
  assert.ok((only.offersCount ?? 0) > 0, "la ville 10 a des offres réelles dans le fixture")
  assert.ok(typeof only.fromPrice === "number" && only.fromPrice > 0)
})

test("runFlexibleHotelSearch (démo) : flexDays=2 exécute 5 recherches réelles à travers le Hub", async () => {
  const q = HotelSearchQuerySchema.parse({
    cityId: "10",
    checkin: "2026-09-10",
    checkout: "2026-09-14",
    adults: "2",
  })
  const result = await runFlexibleHotelSearch(q, 2)
  assert.equal(result.candidates.length, 5)
  assert.deepEqual(
    result.candidates.map((c) => c.offsetDays).sort((a, b) => a - b),
    [-2, -1, 0, 1, 2],
  )
  // Chaque candidat est une recherche RÉELLEMENT exécutée (ok:true, jamais
  // un statut "disponible" fabriqué) — le fixture démo n'étant pas
  // date-dépendant, tous les candidats renvoient les mêmes offres réelles
  // ici, mais chacun vient bien d'un appel séparé au Hub.
  for (const c of result.candidates) {
    assert.equal(c.ok, true)
    assert.ok((c.offersCount ?? 0) > 0)
  }
})

test("runFlexibleHotelSearch (démo) : ville sans offre reste ok:true avec offersCount 0 — jamais fabriqué", async () => {
  const q = HotelSearchQuerySchema.parse({
    cityId: "999999",
    checkin: "2026-09-01",
    checkout: "2026-09-05",
    adults: "2",
  })
  const result = await runFlexibleHotelSearch(q, 1)
  for (const c of result.candidates) {
    assert.equal(c.ok, true)
    assert.equal(c.offersCount, 0)
    assert.equal(c.fromPrice, undefined)
  }
})

test("runFlexibleHotelSearch : requestedCheckin/requestedCheckout reflètent la requête d'origine, pas un candidat", async () => {
  const q = HotelSearchQuerySchema.parse({
    cityId: "10",
    checkin: "2026-09-10",
    checkout: "2026-09-14",
    adults: "2",
  })
  const result = await runFlexibleHotelSearch(q, 1)
  assert.equal(result.requestedCheckin, "2026-09-10")
  assert.equal(result.requestedCheckout, "2026-09-14")
})
