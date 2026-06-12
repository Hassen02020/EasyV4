/**
 * Inventaire des chambres et offres
 */

import { type ProHotel, type HotelBoarding } from "./hotels-fixture"

/** Arrangement de chambres (occupation/lit) — ex: Twin, Double, Triple. */
export interface RoomArrangement {
  id: string
  label: string
  maxAdults: number
  maxChildren: number
}

/** Catégorie de chambre — ex: Standard, Supérieure, Suite. */
export interface RoomCategory {
  id: string
  name: string
  description?: string
}

/** Condition tarifaire — ex: Non remboursable, Annulation gratuite. */
export interface RoomCondition {
  label: string
  notRefundable: boolean
  freeCancellationBefore?: string // ISO date
}

export interface RoomOffer {
  id: string
  roomId: string
  roomName: string
  boarding: HotelBoarding
  price: number
  capacity: number
  /** Disponibilité : false = stop de vente. Défaut true. */
  available: boolean
  arrangement: RoomArrangement
  category: RoomCategory
  conditions: RoomCondition[]
}

/**
 * Arrangement par défaut dérivé de la capacité de la chambre.
 */
function defaultArrangement(capacity: number): RoomArrangement {
  return {
    id: `cap-${capacity}`,
    label: capacity === 1 ? "Single" : capacity === 2 ? "Double" : `×${capacity}`,
    maxAdults: capacity,
    maxChildren: Math.max(0, capacity - 1),
  }
}

/**
 * Catégorie par défaut dérivée du nom de chambre.
 */
function defaultCategory(roomName: string): RoomCategory {
  return { id: roomName.toLowerCase().replace(/\s+/g, "-"), name: roomName }
}

/**
 * Liste les offres de chambres disponibles pour un hôtel.
 * Retourne des combinaisons room + boarding avec prix et métadonnées.
 */
export function listRoomOffers(hotel: ProHotel): RoomOffer[] {
  const offers: RoomOffer[] = []

  for (const room of hotel.rooms) {
    for (const boarding of hotel.boardings) {
      const price = room.prices[boarding.type]
      if (price && price > 0) {
        offers.push({
          id: `${room.id}-${boarding.type}`,
          roomId: room.id,
          roomName: room.name,
          boarding: boarding.type,
          price,
          capacity: room.capacity,
          available: true,
          arrangement: defaultArrangement(room.capacity),
          category: defaultCategory(room.name),
          conditions: [],
        })
      }
    }
  }

  return offers
}

/**
 * Trouve une offre spécifique par ID
 */
export function findOfferById(
  hotel: ProHotel,
  offerId: string,
): RoomOffer | undefined {
  return listRoomOffers(hotel).find((o) => o.id === offerId)
}
