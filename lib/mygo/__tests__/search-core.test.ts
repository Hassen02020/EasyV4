/**
 * Tests unitaires pour `lib/mygo/search-core.ts` — validation partagée par
 * `/api/hotels/search` (B2B) et `/api/hotels/search-public` (B2C).
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  validateSearchDateRange,
  HotelSearchQuerySchema,
  MAX_SEARCH_NIGHTS,
} from "../search-core"

test("validateSearchDateRange : accepte un séjour valide", () => {
  const result = validateSearchDateRange("2026-07-15", "2026-07-20")
  assert.deepEqual(result, { ok: true })
})

test("validateSearchDateRange : refuse checkout == checkin", () => {
  const result = validateSearchDateRange("2026-07-15", "2026-07-15")
  assert.equal(result.ok, false)
  assert.equal(result.error, "invalid_dates")
})

test("validateSearchDateRange : refuse checkout avant checkin", () => {
  const result = validateSearchDateRange("2026-07-20", "2026-07-15")
  assert.equal(result.ok, false)
  assert.equal(result.error, "invalid_dates")
})

test("validateSearchDateRange : refuse un séjour au-delà du maximum", () => {
  const result = validateSearchDateRange("2026-01-01", "2027-01-01")
  assert.equal(result.ok, false)
  assert.equal(result.error, "date_range_too_long")
})

test("validateSearchDateRange : accepte exactement la borne maximale", () => {
  const result = validateSearchDateRange(
    "2026-01-01",
    "2026-03-02", // 60 nuits
  )
  assert.equal(result.ok, true)
})

test("validateSearchDateRange : respecte un maxNights personnalisé", () => {
  const result = validateSearchDateRange("2026-07-15", "2026-07-20", 3)
  assert.equal(result.ok, false)
  assert.equal(result.error, "date_range_too_long")
})

test("MAX_SEARCH_NIGHTS : 60 par défaut", () => {
  assert.equal(MAX_SEARCH_NIGHTS, 60)
})

test("HotelSearchQuerySchema : rejette des paramètres invalides (cityId manquant)", () => {
  const result = HotelSearchQuerySchema.safeParse({
    checkin: "2026-07-15",
    checkout: "2026-07-20",
  })
  assert.equal(result.success, false)
})

test("HotelSearchQuerySchema : valide une requête minimale correcte", () => {
  const result = HotelSearchQuerySchema.safeParse({
    cityId: "10",
    checkin: "2026-07-15",
    checkout: "2026-07-20",
  })
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.cityId, 10)
    assert.equal(result.data.adults, 2) // défaut
    assert.deepEqual(result.data.children, [])
  }
})

test("HotelSearchQuerySchema : n'accepte aucun champ de prix/agence/wallet côté client", () => {
  const result = HotelSearchQuerySchema.safeParse({
    cityId: "10",
    checkin: "2026-07-15",
    checkout: "2026-07-20",
    // Champs qui NE DOIVENT JAMAIS influencer le prix ou l'isolation
    // tenant — le schéma ne les déclare pas, donc Zod les ignore purement
    // et simplement plutôt que de les faire passer au moteur de recherche.
    price: 1,
    markup: 999,
    agencyId: "agency-b",
    walletId: "wallet-x",
    partnerId: "partner-y",
  })
  assert.equal(result.success, true)
  if (result.success) {
    const data = result.data as Record<string, unknown>
    assert.equal("price" in data, false)
    assert.equal("markup" in data, false)
    assert.equal("agencyId" in data, false)
    assert.equal("walletId" in data, false)
    assert.equal("partnerId" in data, false)
  }
})
