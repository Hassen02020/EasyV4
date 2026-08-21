import test from "node:test"
import assert from "node:assert/strict"

import {
  matchDestination,
  parseWorldHotelSearchParams,
  worldHotelStateToApiParams,
} from "../search-state"

function params(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj)
}

test("parseWorldHotelSearchParams : cas nominal, calcule les nuits", () => {
  const result = parseWorldHotelSearchParams(
    params({ destination: "paris", checkIn: "2026-09-10", checkOut: "2026-09-13", adults: "2", rooms: "1" }),
  )
  assert.ok(result.ok)
  if (!result.ok) return
  assert.equal(result.state.city, "Paris")
  assert.equal(result.state.country, "France")
  assert.equal(result.state.nights, 3)
  assert.equal(result.state.adults, 2)
  assert.equal(result.state.rooms, 1)
})

test("parseWorldHotelSearchParams : rejette une destination inconnue", () => {
  const result = parseWorldHotelSearchParams(
    params({ destination: "atlantide", checkIn: "2026-09-10", checkOut: "2026-09-13" }),
  )
  assert.equal(result.ok, false)
})

test("parseWorldHotelSearchParams : rejette checkOut <= checkIn", () => {
  const result = parseWorldHotelSearchParams(
    params({ destination: "paris", checkIn: "2026-09-10", checkOut: "2026-09-10" }),
  )
  assert.equal(result.ok, false)
})

test("parseWorldHotelSearchParams : rejette une date malformée", () => {
  const result = parseWorldHotelSearchParams(
    params({ destination: "paris", checkIn: "10-09-2026", checkOut: "2026-09-13" }),
  )
  assert.equal(result.ok, false)
})

test("parseWorldHotelSearchParams : applique les défauts adults/rooms si absents", () => {
  const result = parseWorldHotelSearchParams(
    params({ destination: "rome", checkIn: "2026-09-10", checkOut: "2026-09-11" }),
  )
  assert.ok(result.ok)
  if (!result.ok) return
  assert.equal(result.state.adults, 2)
  assert.equal(result.state.rooms, 1)
  assert.equal(result.state.stars, undefined)
})

test("parseWorldHotelSearchParams : accepte et propage le filtre stars", () => {
  const result = parseWorldHotelSearchParams(
    params({ destination: "rome", checkIn: "2026-09-10", checkOut: "2026-09-11", stars: "5" }),
  )
  assert.ok(result.ok)
  if (!result.ok) return
  assert.equal(result.state.stars, 5)
})

test("matchDestination : égalité exacte sur value", () => {
  assert.equal(matchDestination("dubai"), "dubai")
})

test("matchDestination : sous-chaîne du label", () => {
  assert.equal(matchDestination("Marrakech"), "marrakech")
})

test("matchDestination : retourne '' si aucune correspondance (pas de valeur inventée)", () => {
  assert.equal(matchDestination("Atlantide"), "")
})

test("worldHotelStateToApiParams : construit les query params canoniques", () => {
  const result = parseWorldHotelSearchParams(
    params({ destination: "istanbul", checkIn: "2026-10-01", checkOut: "2026-10-04", adults: "3", rooms: "2", stars: "4" }),
  )
  assert.ok(result.ok)
  if (!result.ok) return
  const qs = worldHotelStateToApiParams(result.state)
  assert.equal(qs.get("destination"), "istanbul")
  assert.equal(qs.get("checkIn"), "2026-10-01")
  assert.equal(qs.get("checkOut"), "2026-10-04")
  assert.equal(qs.get("adults"), "3")
  assert.equal(qs.get("rooms"), "2")
  assert.equal(qs.get("stars"), "4")
})
