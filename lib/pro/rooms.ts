/**
 * Inventaire des chambres et offres
 */

import { type ProHotel, type HotelBoarding } from "./hotels-fixture"

export interface RoomOfferCategory {
  id?: string
  name: string
  description?: string
}

export interface RoomOfferArrangement {
  id?: string
  label: string
  maxAdults?: number
  maxChildren?: number
}

export interface RoomOffer {
  id: string
  roomId: string
  roomName: string
  boarding: HotelBoarding
  price: number
  capacity: number
  /** Catégorie de la chambre (alias de roomName) */
  category: RoomOfferCategory
  /** Arrangement / pension */
  arrangement: RoomOfferArrangement
  /** Conditions tarifaires */
  conditions?: string[]
  /** Disponibilité */
  available?: boolean
}

/**
 * Liste les offres de chambres disponibles pour un hôtel
 * Retourne des combinaisons room + boarding avec prix
 */
export function listRoomOffers(hotel: ProHotel): RoomOffer[] {
  const offers: RoomOffer[] = []

  for (const room of hotel.rooms) {
    for (const boarding of hotel.boardings) {
      const price = room.prices[boarding]
      if (price && price > 0) {
        offers.push({
          id: `${room.id}-${boarding}`,
          roomId: room.id,
          roomName: room.name,
          boarding,
          price,
          capacity: room.capacity,
          category: { id: room.id, name: room.name },
          arrangement: { id: boarding, label: boarding.toUpperCase(), maxAdults: room.capacity, maxChildren: 0 },
          available: true,
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
export function findOfferById(hotel: ProHotel, offerId: string): RoomOffer | undefined {
  return listRoomOffers(hotel).find((o) => o.id === offerId)
}
