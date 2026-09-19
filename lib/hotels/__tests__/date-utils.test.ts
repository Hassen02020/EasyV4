import test from "node:test"
import assert from "node:assert/strict"

import {
  calculateNights,
  parseIsoDateLocal,
  formatDateIso,
  addDaysLocal,
  isValidStayRange,
  todayLocal,
} from "../date-utils"

// Robustesse calendrier — checklist explicite du master prompt "Hotel Search
// Engine V2" (§10) : 1/2/6 nuits, changement d'année, année bissextile,
// jamais un calcul basé sur des timestamps/heures.

test("calculateNights : 12 → 13 = 1 nuit", () => {
  assert.equal(calculateNights(parseIsoDateLocal("2026-10-12"), parseIsoDateLocal("2026-10-13")), 1)
})

test("calculateNights : 12 → 14 = 2 nuits", () => {
  assert.equal(calculateNights(parseIsoDateLocal("2026-10-12"), parseIsoDateLocal("2026-10-14")), 2)
})

test("calculateNights : 12 → 18 = 6 nuits", () => {
  assert.equal(calculateNights(parseIsoDateLocal("2026-10-12"), parseIsoDateLocal("2026-10-18")), 6)
})

test("calculateNights : 31 déc → 1 jan = 1 nuit (changement d'année)", () => {
  assert.equal(calculateNights(parseIsoDateLocal("2026-12-31"), parseIsoDateLocal("2027-01-01")), 1)
})

test("calculateNights : 28 fév → 1 mars, année NON bissextile (2026) = 1 nuit", () => {
  assert.equal(calculateNights(parseIsoDateLocal("2026-02-28"), parseIsoDateLocal("2026-03-01")), 1)
})

test("calculateNights : 28 fév → 29 fév, année bissextile (2028) existe et compte 1 nuit", () => {
  assert.equal(calculateNights(parseIsoDateLocal("2028-02-28"), parseIsoDateLocal("2028-02-29")), 1)
})

test("calculateNights : 28 fév → 1 mars, année bissextile (2028) = 2 nuits (29 fév existe)", () => {
  assert.equal(calculateNights(parseIsoDateLocal("2028-02-28"), parseIsoDateLocal("2028-03-01")), 2)
})

test("calculateNights : même date = 0 nuit, jamais négatif", () => {
  assert.equal(calculateNights(parseIsoDateLocal("2026-10-12"), parseIsoDateLocal("2026-10-12")), 0)
})

test("calculateNights : départ avant arrivée = 0, jamais un nombre négatif", () => {
  assert.equal(calculateNights(parseIsoDateLocal("2026-10-18"), parseIsoDateLocal("2026-10-12")), 0)
})

test("calculateNights : null/undefined = 0, jamais une exception", () => {
  assert.equal(calculateNights(null, parseIsoDateLocal("2026-10-12")), 0)
  assert.equal(calculateNights(parseIsoDateLocal("2026-10-12"), null), 0)
  assert.equal(calculateNights(null, null), 0)
})

test("parseIsoDateLocal : round-trip avec formatDateIso préserve le jour calendaire exact (pas de décalage UTC)", () => {
  const dates = ["2026-01-01", "2026-02-28", "2028-02-29", "2026-12-31", "2026-09-19"]
  for (const iso of dates) {
    const parsed = parseIsoDateLocal(iso)
    assert.ok(parsed, `parseIsoDateLocal(${iso}) ne doit jamais être null`)
    assert.equal(formatDateIso(parsed!), iso, `round-trip cassé pour ${iso}`)
  }
})

test("parseIsoDateLocal : chaîne vide/absente = null, jamais une exception", () => {
  assert.equal(parseIsoDateLocal(""), null)
  assert.equal(parseIsoDateLocal(undefined), null)
  assert.equal(parseIsoDateLocal(null), null)
})

test("addDaysLocal : traverse un changement de mois/année sans dérive", () => {
  const d = parseIsoDateLocal("2026-12-31")!
  assert.equal(formatDateIso(addDaysLocal(d, 1)), "2027-01-01")
})

test("addDaysLocal : traverse le 29 février d'une année bissextile", () => {
  const d = parseIsoDateLocal("2028-02-28")!
  assert.equal(formatDateIso(addDaysLocal(d, 1)), "2028-02-29")
  assert.equal(formatDateIso(addDaysLocal(d, 2)), "2028-03-01")
})

test("isValidStayRange : refuse une arrivée dans le passé", () => {
  const yesterday = addDaysLocal(todayLocal(), -1)
  const tomorrow = addDaysLocal(todayLocal(), 1)
  assert.equal(isValidStayRange({ checkIn: yesterday, checkOut: tomorrow }), false)
})

test("isValidStayRange : accepte aujourd'hui → demain (1 nuit)", () => {
  assert.equal(isValidStayRange({ checkIn: todayLocal(), checkOut: addDaysLocal(todayLocal(), 1) }), true)
})

test("isValidStayRange : refuse une seule date posée", () => {
  assert.equal(isValidStayRange({ checkIn: todayLocal(), checkOut: null }), false)
  assert.equal(isValidStayRange({ checkIn: null, checkOut: addDaysLocal(todayLocal(), 1) }), false)
})

test("isValidStayRange : refuse départ = arrivée (0 nuit)", () => {
  const d = parseIsoDateLocal("2026-10-12")
  assert.equal(isValidStayRange({ checkIn: d, checkOut: d }), false)
})
