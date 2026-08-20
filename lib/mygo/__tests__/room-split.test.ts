/**
 * Tests unitaires pour `lib/mygo/room-split.ts` (recherche multi-chambres).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { splitIntoRooms, encodeRoomsParam, decodeRoomsParam } from "../room-split"

test("splitIntoRooms : répartit équitablement les adultes (division exacte)", () => {
  const rooms = splitIntoRooms(2, 4, [])
  assert.deepEqual(rooms, [{ adults: 2 }, { adults: 2 }])
})

test("splitIntoRooms : distribue le reste aux premières chambres", () => {
  const rooms = splitIntoRooms(3, 7, [])
  assert.deepEqual(
    rooms.map((r) => r.adults),
    [3, 2, 2],
  )
})

test("splitIntoRooms : au moins 1 adulte par chambre même si adultes < nb chambres", () => {
  const rooms = splitIntoRooms(4, 2, [])
  assert.deepEqual(
    rooms.map((r) => r.adults),
    [1, 1, 1, 1],
  )
})

test("splitIntoRooms : assigne les âges enfants en tourniquet", () => {
  const rooms = splitIntoRooms(2, 4, [5, 8, 3])
  assert.deepEqual(rooms[0].childAges, [5, 3])
  assert.deepEqual(rooms[1].childAges, [8])
})

test("splitIntoRooms : chambre unique reçoit tous les adultes/âges", () => {
  const rooms = splitIntoRooms(1, 3, [7])
  assert.deepEqual(rooms, [{ adults: 3, childAges: [7] }])
})

test("encodeRoomsParam / decodeRoomsParam : round-trip fidèle", () => {
  const rooms = splitIntoRooms(3, 5, [5, 8])
  const encoded = encodeRoomsParam(rooms)
  const decoded = decodeRoomsParam(encoded)
  assert.deepEqual(decoded, rooms)
})

test("encodeRoomsParam : format compact attendu", () => {
  const encoded = encodeRoomsParam([
    { adults: 2, childAges: [5, 8] },
    { adults: 1 },
  ])
  assert.equal(encoded, "2-5.8|1")
})

test("decodeRoomsParam : ignore les âges hors bornes (0-17) et plafonne les adultes (1-6)", () => {
  const decoded = decodeRoomsParam("9-5.99.abc|0")
  assert.deepEqual(decoded, [{ adults: 6, childAges: [5] }, { adults: 1 }])
})

test("decodeRoomsParam : plafonne à 8 chambres", () => {
  const encoded = Array.from({ length: 12 }, () => "1").join("|")
  const decoded = decodeRoomsParam(encoded)
  assert.equal(decoded.length, 8)
})
