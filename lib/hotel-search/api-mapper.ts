/**
 * API Mapper - Transforme SearchState en payload JSON standardisé
 * 
 * Ce mapper convertit l'état de recherche interne en un format standardisé
 * compatible avec les connecteurs XML (MyGo, Amadeus, Sabre, etc.)
 */

import type { HotelSearchState, RoomOccupancy } from "./types"
import { calculateNights } from "./validation"

/**
 * Payload standardisé pour la recherche hôtelière
 * Format compatible avec la plupart des API XML hôtelières
 */
export interface HotelSearchApiPayload {
  // Destination
  destination: {
    city?: string
    country?: string
    countryCode?: string
    coordinates?: { lat: number; lng: number }
  }

  // Dates
  dates: {
    checkIn: string // ISO 8601 (YYYY-MM-DD)
    checkOut: string // ISO 8601 (YYYY-MM-DD)
    nights: number
  }

  // Occupation
  rooms: Array<{
    adults: number
    children: number
    childAges: number[]
  }>

  // Nationalité (impacte le pricing)
  nationality: "resident" | "non_resident"

  // Filtres optionnels
  filters?: {
    starRating?: number[]
    priceRange?: { min: number; max: number }
    amenities?: string[]
    boardType?: string[]
  }

  // Métadonnées pour le fournisseur
  metadata: {
    sessionId: string
    timestamp: string
    clientIp?: string
    userAgent?: string
  }
}

/**
 * Payload spécifique pour MyGo (format XML)
 */
export interface MyGoSearchPayload {
  SearchRQ: {
    Destination: {
      CityCode?: string
      CountryCode?: string
    }
    StayDuration: {
      CheckIn: string
      CheckOut: string
    }
    RoomCandidates: Array<{
      RoomCandidate: {
        GuestCounts: {
          GuestCount: Array<{
            Age?: number
            Code: "ADULT" | "CHILD"
          }>
        }
      }
    }>
    Nationality: string
  }
}

/**
 * Payload spécifique pour Amadeus (format JSON)
 */
export interface AmadeusSearchPayload {
  cityCode?: string
  checkIn: string
  checkOut: string
  roomQuantity: number
  guests: {
    adults: number
    children: number
    childAges: number[]
  }[]
  nationality: string
}

/**
 * Convertit SearchState en payload standardisé
 */
export function toApiPayload(
  state: HotelSearchState,
  metadata?: {
    sessionId?: string
    clientIp?: string
    userAgent?: string
  }
): HotelSearchApiPayload {
  const nights = calculateNights(state.dates.checkIn, state.dates.checkOut)

  return {
    destination: state.destination,
    dates: {
      checkIn: formatDate(state.dates.checkIn),
      checkOut: formatDate(state.dates.checkOut),
      nights,
    },
    rooms: state.rooms.map((room) => ({
      adults: room.adults,
      children: room.children,
      childAges: room.childAges,
    })),
    nationality: state.nationality,
    filters: state.filters,
    metadata: {
      sessionId: metadata?.sessionId || generateSessionId(),
      timestamp: new Date().toISOString(),
      clientIp: metadata?.clientIp,
      userAgent: metadata?.userAgent,
    },
  }
}

/**
 * Convertit SearchState en payload MyGo (XML-ready)
 */
export function toMyGoPayload(state: HotelSearchState): MyGoSearchPayload {
  const nights = calculateNights(state.dates.checkIn, state.dates.checkOut)

  return {
    SearchRQ: {
      Destination: {
        CityCode: state.destination.city,
        CountryCode: state.destination.countryCode,
      },
      StayDuration: {
        CheckIn: formatDate(state.dates.checkIn),
        CheckOut: formatDate(state.dates.checkOut),
      },
      RoomCandidates: state.rooms.map((room) => ({
        RoomCandidate: {
          GuestCounts: {
            GuestCount: [
              ...Array(room.adults).fill(null).map(() => ({ Code: "ADULT" as const })),
              ...room.childAges.map((age) => ({ Age: age, Code: "CHILD" as const })),
            ],
          },
        },
      })),
      Nationality: state.nationality === "resident" ? "TN" : "INT",
    },
  }
}

/**
 * Convertit SearchState en payload Amadeus (JSON)
 */
export function toAmadeusPayload(state: HotelSearchState): AmadeusSearchPayload {
  return {
    cityCode: state.destination.countryCode,
    checkIn: formatDate(state.dates.checkIn),
    checkOut: formatDate(state.dates.checkOut),
    roomQuantity: state.rooms.length,
    guests: state.rooms.map((room) => ({
      adults: room.adults,
      children: room.children,
      childAges: room.childAges,
    })),
    nationality: state.nationality === "resident" ? "TN" : "INT",
  }
}

/**
 * Convertit RoomOccupancy en format standard OTG (Open Travel Group)
 */
export function toOTGOccupancy(rooms: RoomOccupancy[]): string {
  return rooms
    .map((room) => {
      const adults = room.adults
      const children = room.childAges.join(",")
      return children ? `${adults}/${children}` : `${adults}`
    })
    .join(",")
}

/**
 * Parse une chaîne OTG en RoomOccupancy
 * Format: "2,2/0,2/5,3" → 2 chambres: (2 adultes), (2 adultes, 0 enfants), (2 adultes, 5 ans), (3 adultes)
 */
export function fromOTGOccupancy(occupancyStr: string): RoomOccupancy[] {
  return occupancyStr.split(",").map((roomStr) => {
    const [adultsStr, childrenStr] = roomStr.split("/")
    const adults = parseInt(adultsStr, 10)
    const childAges = childrenStr
      ? childrenStr.split(",").map((age) => parseInt(age, 10) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17)
      : []
    return {
      adults,
      children: childAges.length,
      childAges,
    }
  })
}

/**
 * Formate une Date en string ISO 8601 (YYYY-MM-DD)
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]
}

/**
 * Génère un ID de session unique
 */
function generateSessionId(): string {
  return `search_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Valide qu'un payload est prêt pour l'envoi API
 */
export function validateApiPayload(payload: HotelSearchApiPayload): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!payload.destination.city && !payload.destination.countryCode) {
    errors.push("Destination requise (ville ou pays)")
  }

  if (!payload.dates.checkIn || !payload.dates.checkOut) {
    errors.push("Dates d'arrivée et de départ requises")
  }

  if (payload.rooms.length === 0) {
    errors.push("Au moins une chambre requise")
  }

  if (payload.rooms.some((room) => room.adults === 0)) {
    errors.push("Chaque chambre doit avoir au moins 1 adulte")
  }

  if (
    payload.rooms.some(
      (room) => room.children > 0 && room.childAges.length !== room.children
    )
  ) {
    errors.push("L'âge est obligatoire pour chaque enfant")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
