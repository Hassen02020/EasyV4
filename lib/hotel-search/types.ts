/**
 * Types pour le moteur de recherche hôtelière
 * Gestion de l'occupation complexe (multi-chambres, âge enfants, nationalité)
 */

/**
 * Âge d'un enfant (en années)
 * Les API XML hôtelières exigent l'âge exact pour le pricing
 */
export type ChildAge = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17

/**
 * Occupation d'une chambre
 */
export interface RoomOccupancy {
  adults: number // 1-4 adultes
  children: number // 0-N enfants
  childAges: ChildAge[] // Âge de chaque enfant (même longueur que children)
}

/**
 * Nationalité du client (impacte le pricing local vs international)
 */
export type Nationality = "resident" | "non_resident"

/**
 * État complet de recherche hôtelière
 */
export interface HotelSearchState {
  destination: {
    city?: string
    country?: string
    countryCode?: string // ISO 3166-1 alpha-2 (TN, FR, MA...)
    coordinates?: { lat: number; lng: number }
  }
  dates: {
    checkIn: Date
    checkOut: Date
    nights: number // Calculé automatiquement
  }
  rooms: RoomOccupancy[] // 1-N chambres
  nationality: Nationality
  filters?: {
    starRating?: number[]
    priceRange?: { min: number; max: number }
    amenities?: string[]
    boardType?: string[] // BB, HB, FB, AI
  }
}

/**
 * Action pour le reducer de gestion des chambres
 */
export type RoomAction =
  | { type: "ADD_ROOM" }
  | { type: "REMOVE_ROOM"; payload: { roomIndex: number } }
  | { type: "UPDATE_ADULTS"; payload: { roomIndex: number; delta: number } }
  | { type: "ADD_CHILD"; payload: { roomIndex: number } }
  | { type: "REMOVE_CHILD"; payload: { roomIndex: number; childIndex: number } }
  | { type: "UPDATE_CHILD_AGE"; payload: { roomIndex: number; childIndex: number; age: ChildAge } }
  | { type: "SET_NATIONALITY"; payload: Nationality }
  | { type: "RESET" }

/**
 * État initial par défaut
 */
export const defaultRoomOccupancy: RoomOccupancy = {
  adults: 2,
  children: 0,
  childAges: [],
}

export const defaultSearchState: HotelSearchState = {
  destination: {},
  dates: {
    checkIn: new Date(),
    checkOut: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 jours
    nights: 7,
  },
  rooms: [defaultRoomOccupancy],
  nationality: "resident", // Défaut Tunisie
}

/**
 * Validation rules
 */
export const SEARCH_CONSTRAINTS = {
  MAX_ROOMS: 8,
  MAX_ADULTS_PER_ROOM: 4,
  MIN_ADULTS_PER_ROOM: 1,
  MAX_CHILDREN_PER_ROOM: 4,
  MAX_TOTAL_GUESTS: 32,
  MIN_NIGHTS: 1,
  MAX_NIGHTS: 30,
  MAX_CHECKIN_DAYS_AHEAD: 365,
} as const

/**
 * Résumé de l'occupation pour affichage
 */
export interface OccupancySummary {
  totalRooms: number
  totalAdults: number
  totalChildren: number
  totalGuests: number
  hasChildren: boolean
}
