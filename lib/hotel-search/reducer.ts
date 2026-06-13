/**
 * Reducer pour la gestion de l'occupation des chambres
 * Assure l'immuabilité et la prévisibilité des états complexes
 */

import type { RoomAction, RoomOccupancy, HotelSearchState } from "./types"
import { defaultRoomOccupancy, SEARCH_CONSTRAINTS } from "./types"

/**
 * Réduit une action sur l'état de recherche
 */
export function hotelSearchReducer(
  state: HotelSearchState,
  action: RoomAction
): HotelSearchState {
  switch (action.type) {
    case "ADD_ROOM": {
      if (state.rooms.length >= SEARCH_CONSTRAINTS.MAX_ROOMS) {
        return state
      }
      return {
        ...state,
        rooms: [...state.rooms, { ...defaultRoomOccupancy }],
      }
    }

    case "REMOVE_ROOM": {
      if (state.rooms.length <= 1) {
        return state
      }
      const newRooms = state.rooms.filter(
        (_, index) => index !== action.payload.roomIndex
      )
      return {
        ...state,
        rooms: newRooms,
      }
    }

    case "UPDATE_ADULTS": {
      const { roomIndex, delta } = action.payload
      const room = state.rooms[roomIndex]
      const newAdults = room.adults + delta

      if (
        newAdults < SEARCH_CONSTRAINTS.MIN_ADULTS_PER_ROOM ||
        newAdults > SEARCH_CONSTRAINTS.MAX_ADULTS_PER_ROOM
      ) {
        return state
      }

      const newRooms = [...state.rooms]
      newRooms[roomIndex] = {
        ...room,
        adults: newAdults,
      }

      return {
        ...state,
        rooms: newRooms,
      }
    }

    case "ADD_CHILD": {
      const { roomIndex } = action.payload
      const room = state.rooms[roomIndex]

      if (room.children >= SEARCH_CONSTRAINTS.MAX_CHILDREN_PER_ROOM) {
        return state
      }

      const newRooms = [...state.rooms]
      newRooms[roomIndex] = {
        ...room,
        children: room.children + 1,
        childAges: [...room.childAges, 0], // Âge par défaut 0 (bébé)
      }

      return {
        ...state,
        rooms: newRooms,
      }
    }

    case "REMOVE_CHILD": {
      const { roomIndex, childIndex } = action.payload
      const room = state.rooms[roomIndex]

      if (childIndex < 0 || childIndex >= room.childAges.length) {
        return state
      }

      const newRooms = [...state.rooms]
      newRooms[roomIndex] = {
        ...room,
        children: room.children - 1,
        childAges: room.childAges.filter((_, i) => i !== childIndex),
      }

      return {
        ...state,
        rooms: newRooms,
      }
    }

    case "UPDATE_CHILD_AGE": {
      const { roomIndex, childIndex, age } = action.payload
      const room = state.rooms[roomIndex]

      if (childIndex < 0 || childIndex >= room.childAges.length) {
        return state
      }

      const newRooms = [...state.rooms]
      newRooms[roomIndex] = {
        ...room,
        childAges: room.childAges.map((a, i) => (i === childIndex ? age : a)),
      }

      return {
        ...state,
        rooms: newRooms,
      }
    }

    case "SET_NATIONALITY": {
      return {
        ...state,
        nationality: action.payload,
      }
    }

    case "RESET": {
      return {
        ...state,
        rooms: [{ ...defaultRoomOccupancy }],
        nationality: "resident",
      }
    }

    default:
      return state
  }
}

/**
 * Calculer le résumé de l'occupation
 */
export function calculateOccupancySummary(state: HotelSearchState) {
  const totalRooms = state.rooms.length
  const totalAdults = state.rooms.reduce((sum, room) => sum + room.adults, 0)
  const totalChildren = state.rooms.reduce((sum, room) => sum + room.children, 0)
  const totalGuests = totalAdults + totalChildren
  const hasChildren = totalChildren > 0

  return {
    totalRooms,
    totalAdults,
    totalChildren,
    totalGuests,
    hasChildren,
  }
}
