/**
 * Sélection chambre/pension sur une offre myGo — Phase 9.
 *
 * Extrait de la page voyageurs B2B (`app/pro/(app)/booking/travelers/page.tsx`)
 * car c'est la logique qui décide QUELLE chambre exacte est réservée : une
 * agence ne doit jamais pouvoir se retrouver avec une chambre/pension
 * différente de celle choisie sur `/pro/hotels/[id]` (rate belonging à un
 * autre contexte), et une chambre passée en `stopReservation` (plus
 * disponible depuis la re-recherche de revalidation) ne doit jamais être
 * acceptée silencieusement.
 */

import type { BoardingOfferDTO, HotelOfferDTO, RoomOfferDTO } from "@/lib/mygo/types"

export interface MatchedRoom {
  boarding: BoardingOfferDTO
  room: RoomOfferDTO
}

/**
 * Retrouve, dans une offre hôtel fraîchement re-recherchée, la chambre
 * exacte (boardingId + roomId) choisie précédemment par l'agence.
 * Retourne `null` si la pension n'existe plus, si la chambre n'existe
 * plus, ou si elle est passée en `stopReservation` — dans tous ces cas
 * l'appelant doit traiter la sélection comme périmée, jamais y substituer
 * une autre chambre.
 */
export function matchSelectedRoom(
  offer: HotelOfferDTO,
  boardingId: number,
  roomId: number,
): MatchedRoom | null {
  for (const boarding of offer.boardings) {
    if (boarding.id !== boardingId) continue
    for (const pax of boarding.pax) {
      for (const room of pax.rooms) {
        if (room.id === roomId && !room.stopReservation) {
          return { boarding, room }
        }
      }
    }
  }
  return null
}
