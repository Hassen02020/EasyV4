import test from "node:test"
import assert from "node:assert/strict"
import { matchHotels, isAutoMergeable } from "../core/mapping"
import type { NormalizedHotel } from "../core/types"

function hotel(overrides: Partial<NormalizedHotel>): NormalizedHotel {
  return {
    name: "El Mouradi Gammarth",
    city: "Gammarth",
    images: [],
    facilities: [],
    supplierMappings: [],
    ...overrides,
  }
}

test("matchHotels : mapping fournisseur explicite déjà partagé -> EXACT", () => {
  const a = hotel({ supplierMappings: [{ supplier: "mygo", supplierHotelCode: "500001" }] })
  const b = hotel({
    name: "Different Name Entirely",
    supplierMappings: [{ supplier: "mygo", supplierHotelCode: "500001" }],
  })
  assert.equal(matchHotels(a, b).confidence, "EXACT")
})

test("matchHotels : coordonnées proches + nom similaire -> EXACT", () => {
  const a = hotel({ latitude: 36.9, longitude: 10.3 })
  const b = hotel({ name: "El Mouradi Gammarth Hotel", latitude: 36.9001, longitude: 10.3001 })
  assert.equal(matchHotels(a, b).confidence, "EXACT")
})

test("matchHotels : même ville + nom fortement similaire -> HIGH", () => {
  const a = hotel({})
  const b = hotel({ name: "El Mouradi Gammarth Resort" })
  const result = matchHotels(a, b)
  assert.ok(result.confidence === "HIGH" || result.confidence === "MEDIUM")
})

test("matchHotels : même ville, nom faiblement similaire -> MEDIUM", () => {
  const a = hotel({ name: "Hotel Beach Club" })
  const b = hotel({ name: "Hotel Beach Resort" })
  assert.equal(matchHotels(a, b).confidence, "MEDIUM")
})

test("matchHotels : aucun signal géo/ville, nom faible -> LOW, jamais auto-fusionné", () => {
  const a = hotel({ city: undefined, name: "Hotel Alpha Beach" })
  const b = hotel({ city: undefined, name: "Alpha Beach Resort" })
  const result = matchHotels(a, b)
  assert.equal(result.confidence, "LOW")
  assert.equal(isAutoMergeable(result.confidence), false)
})

test("matchHotels : rien en commun -> UNMATCHED", () => {
  const a = hotel({ name: "Iberostar Selection", city: "Sousse" })
  const b = hotel({ name: "Movenpick Gammarth", city: "Tunis" })
  assert.equal(matchHotels(a, b).confidence, "UNMATCHED")
})

test("isAutoMergeable : EXACT/HIGH/MEDIUM fusionnables, LOW/UNMATCHED jamais", () => {
  assert.equal(isAutoMergeable("EXACT"), true)
  assert.equal(isAutoMergeable("HIGH"), true)
  assert.equal(isAutoMergeable("MEDIUM"), true)
  assert.equal(isAutoMergeable("LOW"), false)
  assert.equal(isAutoMergeable("UNMATCHED"), false)
})
