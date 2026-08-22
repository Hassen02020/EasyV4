/**
 * Provider Adapter — convertit le `HotelSearchState` canonique (formulaire)
 * en paramètres réels pour `/api/hotels/search` / `/api/hotels/search-public`
 * (`lib/mygo/search-core.ts::HotelSearchQuerySchema`, le seul moteur de
 * recherche myGo réel, déjà partagé B2C/B2B).
 *
 * Ce fichier contenait auparavant `toMyGoPayload`/`toAmadeusPayload` (formats
 * "XML-ready"/"Amadeus JSON" inventés, jamais alignés sur le vrai schéma myGo
 * — `SearchDetails.Rooms`, pas `RoomCandidates`/`GuestCounts` — et Amadeus
 * n'est pas un fournisseur réellement intégré dans ce dépôt) ainsi que
 * `toOTGOccupancy`/`fromOTGOccupancy` (format OTG jamais utilisé nulle
 * part). Recherche confirmée avant Phase 14 : zéro import de l'un de ces
 * exports dans tout le reste du dépôt. Remplacés ici par le seul mapping
 * réellement branché : `HotelSearchState` → les query params que
 * `/hotels/search` (page) et `useHotelSearch`/`/api/hotels/search*`
 * (fournisseur) consomment déjà.
 */

import type { HotelSearchState } from "./types"
import { calculateNights } from "./validation"
import { encodeRoomsParam, type RoomSplit } from "@/lib/mygo/room-split"

export interface HotelSearchParamsOptions {
  stars?: number[]
  onlyAvailable?: boolean
}

/**
 * Convertit un `HotelSearchState` en `URLSearchParams` prêts pour
 * `/hotels/search?...` (et donc pour `useHotelSearch`/`runHotelSearch` en
 * aval, qui parsent exactement ces clés). Une seule chambre encode
 * `adults`/`children` (comportement historique, compatible avec tout code
 * qui lit encore ces clés isolément) ; au-delà d'une chambre, la
 * composition RÉELLE de chaque chambre est encodée via `rooms`
 * (`encodeRoomsParam`, déjà consommé par `decodeRoomsParam` côté
 * fournisseur) — jamais une répartition estimée.
 */
export function toHotelSearchParams(
  state: HotelSearchState,
  options: HotelSearchParamsOptions = {},
): URLSearchParams {
  const params = new URLSearchParams()

  if (state.destination.cityId != null) {
    params.set("cityId", String(state.destination.cityId))
  }
  if (state.destination.city) {
    params.set("city", state.destination.city)
  }
  if (state.destination.hotelId != null) {
    params.set("hotelId", String(state.destination.hotelId))
  }
  if (state.destination.zone) {
    params.set("zone", state.destination.zone)
  }

  params.set("checkin", formatDate(state.dates.checkIn))
  params.set("checkout", formatDate(state.dates.checkOut))

  const totalAdults = state.rooms.reduce((sum, r) => sum + r.adults, 0)
  const allChildAges = state.rooms.flatMap((r) => r.childAges)
  params.set("adults", String(totalAdults))
  if (allChildAges.length > 0) {
    params.set("children", allChildAges.join(","))
  }

  if (state.rooms.length > 1) {
    const split: RoomSplit[] = state.rooms.map((r) => ({
      adults: r.adults,
      ...(r.childAges.length > 0 ? { childAges: r.childAges } : {}),
    }))
    params.set("rooms", encodeRoomsParam(split))
  }

  params.set("roomsCount", String(state.rooms.length))

  const stars = options.stars ?? state.filters?.starRating
  if (stars && stars.length > 0) {
    params.set("stars", stars.join(","))
  }
  if (options.onlyAvailable) {
    params.set("onlyAvailable", "1")
  }

  return params
}

/** Nombre de nuits pour ce `HotelSearchState` — délègue à `calculateNights` (validation.ts), pas de logique dupliquée. */
export function nightsFor(state: HotelSearchState): number {
  return calculateNights(state.dates.checkIn, state.dates.checkOut)
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!
}
