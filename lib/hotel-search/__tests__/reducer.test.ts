import test from "node:test"
import assert from "node:assert/strict"

import { hotelSearchReducer, calculateOccupancySummary } from "../reducer"
import { defaultSearchState, SEARCH_CONSTRAINTS } from "../types"
import type { HotelSearchState } from "../types"

function baseState(): HotelSearchState {
  return { ...defaultSearchState, rooms: [{ adults: 2, children: 0, childAges: [] }] }
}

test("hotelSearchReducer ADD_ROOM : ajoute une chambre par défaut", () => {
  const state = hotelSearchReducer(baseState(), { type: "ADD_ROOM" })
  assert.equal(state.rooms.length, 2)
  assert.deepEqual(state.rooms[1], { adults: 2, children: 0, childAges: [] })
})

test("hotelSearchReducer ADD_ROOM : refuse au-delà de MAX_ROOMS", () => {
  let state = baseState()
  for (let i = 0; i < SEARCH_CONSTRAINTS.MAX_ROOMS + 3; i++) {
    state = hotelSearchReducer(state, { type: "ADD_ROOM" })
  }
  assert.equal(state.rooms.length, SEARCH_CONSTRAINTS.MAX_ROOMS)
})

test("hotelSearchReducer REMOVE_ROOM : retire la chambre ciblée", () => {
  let state = hotelSearchReducer(baseState(), { type: "ADD_ROOM" })
  state = hotelSearchReducer(state, { type: "REMOVE_ROOM", payload: { roomIndex: 0 } })
  assert.equal(state.rooms.length, 1)
})

test("hotelSearchReducer REMOVE_ROOM : refuse de retirer la dernière chambre", () => {
  const state = hotelSearchReducer(baseState(), { type: "REMOVE_ROOM", payload: { roomIndex: 0 } })
  assert.equal(state.rooms.length, 1)
})

test("hotelSearchReducer UPDATE_ADULTS : incrémente/décrémente dans les bornes", () => {
  let state = hotelSearchReducer(baseState(), { type: "UPDATE_ADULTS", payload: { roomIndex: 0, delta: 1 } })
  assert.equal(state.rooms[0].adults, 3)
  state = hotelSearchReducer(state, { type: "UPDATE_ADULTS", payload: { roomIndex: 0, delta: -10 } })
  assert.equal(state.rooms[0].adults, 3, "un delta qui dépasserait le minimum est ignoré, état inchangé")
})

test("hotelSearchReducer UPDATE_ADULTS : refuse de dépasser MAX_ADULTS_PER_ROOM", () => {
  let state = baseState()
  for (let i = 0; i < 10; i++) {
    state = hotelSearchReducer(state, { type: "UPDATE_ADULTS", payload: { roomIndex: 0, delta: 1 } })
  }
  assert.equal(state.rooms[0].adults, SEARCH_CONSTRAINTS.MAX_ADULTS_PER_ROOM)
})

test("hotelSearchReducer ADD_CHILD : ajoute un enfant âge par défaut 0 (bébé)", () => {
  const state = hotelSearchReducer(baseState(), { type: "ADD_CHILD", payload: { roomIndex: 0 } })
  assert.equal(state.rooms[0].children, 1)
  assert.deepEqual(state.rooms[0].childAges, [0])
})

test("hotelSearchReducer ADD_CHILD : refuse au-delà de MAX_CHILDREN_PER_ROOM", () => {
  let state = baseState()
  for (let i = 0; i < SEARCH_CONSTRAINTS.MAX_CHILDREN_PER_ROOM + 3; i++) {
    state = hotelSearchReducer(state, { type: "ADD_CHILD", payload: { roomIndex: 0 } })
  }
  assert.equal(state.rooms[0].children, SEARCH_CONSTRAINTS.MAX_CHILDREN_PER_ROOM)
})

test("hotelSearchReducer UPDATE_CHILD_AGE : met à jour l'âge exact", () => {
  let state = hotelSearchReducer(baseState(), { type: "ADD_CHILD", payload: { roomIndex: 0 } })
  state = hotelSearchReducer(state, { type: "UPDATE_CHILD_AGE", payload: { roomIndex: 0, childIndex: 0, age: 7 } })
  assert.deepEqual(state.rooms[0].childAges, [7])
})

test("hotelSearchReducer REMOVE_CHILD : retire l'enfant ciblé, garde children/childAges cohérents", () => {
  let state = hotelSearchReducer(baseState(), { type: "ADD_CHILD", payload: { roomIndex: 0 } })
  state = hotelSearchReducer(state, { type: "ADD_CHILD", payload: { roomIndex: 0 } })
  state = hotelSearchReducer(state, { type: "UPDATE_CHILD_AGE", payload: { roomIndex: 0, childIndex: 1, age: 9 } })
  state = hotelSearchReducer(state, { type: "REMOVE_CHILD", payload: { roomIndex: 0, childIndex: 0 } })
  assert.equal(state.rooms[0].children, 1)
  assert.deepEqual(state.rooms[0].childAges, [9])
})

test("hotelSearchReducer SET_NATIONALITY : met à jour la nationalité", () => {
  const state = hotelSearchReducer(baseState(), { type: "SET_NATIONALITY", payload: "non_resident" })
  assert.equal(state.nationality, "non_resident")
})

test("hotelSearchReducer RESET : revient à une chambre par défaut et nationalité resident", () => {
  let state = hotelSearchReducer(baseState(), { type: "ADD_ROOM" })
  state = hotelSearchReducer(state, { type: "SET_NATIONALITY", payload: "non_resident" })
  state = hotelSearchReducer(state, { type: "RESET" })
  assert.equal(state.rooms.length, 1)
  assert.equal(state.nationality, "resident")
})

// --- calculateOccupancySummary : single room, multiple rooms, babies vs children ---

test("calculateOccupancySummary : une chambre simple", () => {
  const summary = calculateOccupancySummary(baseState())
  assert.deepEqual(summary, {
    totalRooms: 1,
    totalAdults: 2,
    totalChildren: 0,
    totalBabies: 0,
    totalBigKids: 0,
    totalGuests: 2,
    hasChildren: false,
  })
})

test("calculateOccupancySummary : plusieurs chambres, distingue bébés (<=2 ans) et enfants (>2 ans)", () => {
  const state: HotelSearchState = {
    ...defaultSearchState,
    rooms: [
      { adults: 2, children: 2, childAges: [7, 3] },
      { adults: 2, children: 1, childAges: [1] },
    ],
  }
  const summary = calculateOccupancySummary(state)
  assert.equal(summary.totalRooms, 2)
  assert.equal(summary.totalAdults, 4)
  assert.equal(summary.totalChildren, 3)
  assert.equal(summary.totalBabies, 1)
  assert.equal(summary.totalBigKids, 2)
  assert.equal(summary.totalGuests, 7)
  assert.equal(summary.hasChildren, true)
})

test("calculateOccupancySummary : un âge de 2 ans compte comme bébé (limite incluse)", () => {
  const state: HotelSearchState = {
    ...defaultSearchState,
    rooms: [{ adults: 1, children: 1, childAges: [2] }],
  }
  const summary = calculateOccupancySummary(state)
  assert.equal(summary.totalBabies, 1)
  assert.equal(summary.totalBigKids, 0)
})
