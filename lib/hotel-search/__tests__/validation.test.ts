import test from "node:test"
import assert from "node:assert/strict"

import {
  roomOccupancySchema,
  datesSchema,
  hotelSearchSchema,
  calculateNights,
  validateChildAges,
} from "../validation"
import { SEARCH_CONSTRAINTS } from "../types"

// --- roomOccupancySchema ---

test("roomOccupancySchema : accepte une chambre simple sans enfant", () => {
  const result = roomOccupancySchema.safeParse({ adults: 2, children: 0, childAges: [] })
  assert.equal(result.success, true)
})

test("roomOccupancySchema : accepte une chambre avec enfants et âges correspondants", () => {
  const result = roomOccupancySchema.safeParse({ adults: 2, children: 2, childAges: [3, 7] })
  assert.equal(result.success, true)
})

test("roomOccupancySchema : refuse un nombre d'âges différent du nombre d'enfants", () => {
  const result = roomOccupancySchema.safeParse({ adults: 2, children: 2, childAges: [3] })
  assert.equal(result.success, false)
})

test("roomOccupancySchema : refuse 0 adulte (occupation invalide)", () => {
  const result = roomOccupancySchema.safeParse({ adults: 0, children: 0, childAges: [] })
  assert.equal(result.success, false)
})

test("roomOccupancySchema : refuse au-delà de MAX_ADULTS_PER_ROOM", () => {
  const result = roomOccupancySchema.safeParse({
    adults: SEARCH_CONSTRAINTS.MAX_ADULTS_PER_ROOM + 1,
    children: 0,
    childAges: [],
  })
  assert.equal(result.success, false)
})

test("roomOccupancySchema : refuse au-delà de MAX_CHILDREN_PER_ROOM", () => {
  const n = SEARCH_CONSTRAINTS.MAX_CHILDREN_PER_ROOM + 1
  const result = roomOccupancySchema.safeParse({
    adults: 2,
    children: n,
    childAges: Array.from({ length: n }, () => 5),
  })
  assert.equal(result.success, false)
})

test("roomOccupancySchema : refuse un âge d'enfant hors 0-17", () => {
  const result = roomOccupancySchema.safeParse({ adults: 2, children: 1, childAges: [18] })
  assert.equal(result.success, false)
})

// --- datesSchema ---

test("datesSchema : accepte checkOut après checkIn dans les bornes", () => {
  const checkIn = new Date(Date.now() + 5 * 86_400_000)
  const checkOut = new Date(Date.now() + 8 * 86_400_000)
  const result = datesSchema.safeParse({ checkIn, checkOut })
  assert.equal(result.success, true)
})

test("datesSchema : refuse checkOut avant ou égal à checkIn", () => {
  const checkIn = new Date(Date.now() + 5 * 86_400_000)
  const result = datesSchema.safeParse({ checkIn, checkOut: checkIn })
  assert.equal(result.success, false)
})

test("datesSchema : refuse un séjour de plus de MAX_NIGHTS", () => {
  const checkIn = new Date(Date.now() + 5 * 86_400_000)
  const checkOut = new Date(checkIn.getTime() + (SEARCH_CONSTRAINTS.MAX_NIGHTS + 5) * 86_400_000)
  const result = datesSchema.safeParse({ checkIn, checkOut })
  assert.equal(result.success, false)
})

test("datesSchema : refuse une date d'arrivée dans le passé", () => {
  const checkIn = new Date(Date.now() - 2 * 86_400_000)
  const checkOut = new Date(Date.now() + 2 * 86_400_000)
  const result = datesSchema.safeParse({ checkIn, checkOut })
  assert.equal(result.success, false)
})

// --- hotelSearchSchema (integration) ---

interface ValidSearchInput {
  destination: { city?: string }
  dates: { checkIn: Date; checkOut: Date }
  rooms: { adults: number; children: number; childAges: number[] }[]
  nationality: "resident" | "non_resident"
}

function validSearch(): ValidSearchInput {
  const checkIn = new Date(Date.now() + 5 * 86_400_000)
  const checkOut = new Date(Date.now() + 8 * 86_400_000)
  return {
    destination: { city: "Hammamet" },
    dates: { checkIn, checkOut },
    rooms: [{ adults: 2, children: 0, childAges: [] }],
    nationality: "resident",
  }
}

test("hotelSearchSchema : accepte une recherche complète valide (une chambre)", () => {
  const result = hotelSearchSchema.safeParse(validSearch())
  assert.equal(result.success, true)
})

test("hotelSearchSchema : accepte plusieurs chambres avec occupations différentes", () => {
  const search = validSearch()
  search.rooms = [
    { adults: 2, children: 2, childAges: [7, 3] },
    { adults: 2, children: 0, childAges: [] },
  ]
  const result = hotelSearchSchema.safeParse(search)
  assert.equal(result.success, true)
})

test("hotelSearchSchema : refuse une recherche sans destination", () => {
  const search = validSearch()
  search.destination = {}
  const result = hotelSearchSchema.safeParse(search)
  assert.equal(result.success, false)
})

test("hotelSearchSchema : refuse au-delà de MAX_TOTAL_GUESTS", () => {
  const search = validSearch()
  // MAX_ROOMS x MAX_ADULTS_PER_ROOM adultes seuls seraient exactement à la
  // limite (8x4=32=MAX_TOTAL_GUESTS) : on ajoute des enfants (comptés eux
  // aussi dans MAX_TOTAL_GUESTS, contrainte indépendante de
  // MAX_CHILDREN_PER_ROOM) pour dépasser réellement le total.
  search.rooms = Array.from({ length: SEARCH_CONSTRAINTS.MAX_ROOMS }, () => ({
    adults: SEARCH_CONSTRAINTS.MAX_ADULTS_PER_ROOM,
    children: SEARCH_CONSTRAINTS.MAX_CHILDREN_PER_ROOM,
    childAges: Array.from({ length: SEARCH_CONSTRAINTS.MAX_CHILDREN_PER_ROOM }, () => 5),
  }))
  const result = hotelSearchSchema.safeParse(search)
  assert.equal(result.success, false)
})

test("hotelSearchSchema : refuse au-delà de MAX_ROOMS chambres", () => {
  const search = validSearch()
  search.rooms = Array.from({ length: SEARCH_CONSTRAINTS.MAX_ROOMS + 1 }, () => ({
    adults: 1,
    children: 0,
    childAges: [] as number[],
  }))
  const result = hotelSearchSchema.safeParse(search)
  assert.equal(result.success, false)
})

// --- calculateNights ---

test("calculateNights : calcule le bon nombre de nuits", () => {
  const checkIn = new Date("2026-06-01T00:00:00Z")
  const checkOut = new Date("2026-06-08T00:00:00Z")
  assert.equal(calculateNights(checkIn, checkOut), 7)
})

test("calculateNights : une seule nuit", () => {
  const checkIn = new Date("2026-06-01T00:00:00Z")
  const checkOut = new Date("2026-06-02T00:00:00Z")
  assert.equal(calculateNights(checkIn, checkOut), 1)
})

// --- validateChildAges ---

test("validateChildAges : true quand 0 enfant et 0 âge", () => {
  assert.equal(validateChildAges(0, []), true)
})

test("validateChildAges : true quand le nombre d'âges correspond et tous valides", () => {
  assert.equal(validateChildAges(2, [3, 15]), true)
})

test("validateChildAges : false quand le nombre d'âges ne correspond pas", () => {
  assert.equal(validateChildAges(2, [3]), false)
})

test("validateChildAges : false quand un âge est hors 0-17", () => {
  assert.equal(validateChildAges(1, [18]), false)
})
