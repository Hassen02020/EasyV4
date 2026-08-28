/**
 * Tests pour la logique PURE de lib/mygo/use-flexible-hotel-search.ts
 * (Phase 35) — jamais le hook React lui-même (pas de moteur de rendu dans
 * ce projet, voir lib/pro/__tests__/room-unavailable-link.test.ts pour le
 * même principe d'extraction déjà établi en Phase 30.4).
 */

import { strict as assert } from "node:assert"
import { test } from "node:test"
import {
  buildFlexibleSearchQueryString,
  applyFlexDaysToParams,
  applyFlexibleCandidateToParams,
} from "../use-flexible-hotel-search"

test("buildFlexibleSearchQueryString : flexDays=0 (mode Exactes) → null, AUCUN appel réseau flexible", () => {
  const qs = buildFlexibleSearchQueryString({
    flexDays: 0,
    cityId: "10",
    checkin: "2026-09-12",
    checkout: "2026-09-15",
    adults: "2",
    children: null,
  })
  assert.equal(qs, null)
})

test("buildFlexibleSearchQueryString : paramètres de recherche manquants → null même si flexDays>0", () => {
  const qs = buildFlexibleSearchQueryString({
    flexDays: 2,
    cityId: null,
    checkin: "2026-09-12",
    checkout: "2026-09-15",
    adults: "2",
    children: null,
  })
  assert.equal(qs, null)
})

test("buildFlexibleSearchQueryString : flexDays>0 → query correcte avec flexDays inclus", () => {
  const qs = buildFlexibleSearchQueryString({
    flexDays: 2,
    cityId: "10",
    checkin: "2026-09-12",
    checkout: "2026-09-15",
    adults: "3",
    children: "5,8",
  })
  assert.ok(qs)
  const params = new URLSearchParams(qs!)
  assert.equal(params.get("cityId"), "10")
  assert.equal(params.get("checkin"), "2026-09-12")
  assert.equal(params.get("checkout"), "2026-09-15")
  assert.equal(params.get("adults"), "3")
  assert.equal(params.get("children"), "5,8")
  assert.equal(params.get("flexDays"), "2")
})

test("applyFlexDaysToParams : ±2 ajoute flexDays sans toucher checkin/checkout", () => {
  const current = new URLSearchParams({
    cityId: "10",
    checkin: "2026-09-12",
    checkout: "2026-09-15",
  })
  const next = applyFlexDaysToParams(current, 2)
  assert.equal(next.get("flexDays"), "2")
  assert.equal(next.get("checkin"), "2026-09-12")
  assert.equal(next.get("checkout"), "2026-09-15")
})

test("applyFlexDaysToParams : repasser à 0 (Exactes) retire flexDays", () => {
  const current = new URLSearchParams({ checkin: "2026-09-12", flexDays: "3" })
  const next = applyFlexDaysToParams(current, 0)
  assert.equal(next.has("flexDays"), false)
})

test("applyFlexibleCandidateToParams : remplace checkin/checkout et retire flexDays (continuité de réservation)", () => {
  const current = new URLSearchParams({
    cityId: "10",
    checkin: "2026-09-12",
    checkout: "2026-09-15",
    flexDays: "3",
    adults: "2",
  })
  const next = applyFlexibleCandidateToParams(current, "2026-09-11", "2026-09-14")
  assert.equal(next.get("checkin"), "2026-09-11")
  assert.equal(next.get("checkout"), "2026-09-14")
  assert.equal(next.has("flexDays"), false)
  // Le reste du contexte de recherche (ville, voyageurs) est préservé.
  assert.equal(next.get("cityId"), "10")
  assert.equal(next.get("adults"), "2")
})
