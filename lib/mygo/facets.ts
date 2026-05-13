/**
 * Calcul des facets (filtres dynamiques) à partir d'un ensemble d'offres
 * `HotelOfferDTO` retournées par `/api/hotels/search`.
 *
 * Les facets pilotent le `FilterSidebar` :
 *  - étoiles (3, 4, 5) avec compteur
 *  - types de pension (toutes les `boardings.name` distinctes)
 *  - équipements (union des `facilities.title`)
 *  - prix (min/max sur `offer.fromPrice`)
 *  - `recommended` count
 *  - `notRefundable` / `freeCancellation` / `available` counts
 */

import type { HotelOfferDTO } from "./types"

export interface HotelFacets {
  stars: { value: number; count: number }[]
  boardings: { name: string; count: number }[]
  facilities: { title: string; count: number }[]
  priceMin: number
  priceMax: number
  recommendedCount: number
  freeCancellationCount: number
  availableCount: number
}

export interface HotelFilterState {
  /** Étoiles cochées. Vide = pas de filtre étoiles. */
  stars: number[]
  /** Noms de boardings cochés. Vide = pas de filtre. */
  boardings: string[]
  /** Titres d'équipements cochés. Vide = pas de filtre. */
  facilities: string[]
  /** Bornes [min, max] en devise courante. */
  priceRange: [number, number] | null
  recommendedOnly: boolean
  freeCancellationOnly: boolean
  availableOnly: boolean
}

export const EMPTY_FILTER_STATE: HotelFilterState = {
  stars: [],
  boardings: [],
  facilities: [],
  priceRange: null,
  recommendedOnly: false,
  freeCancellationOnly: false,
  availableOnly: false,
}

/** Vrai si l'offre a au moins une chambre annulable gratuitement (BEFORE_ARRIVAL). */
function hasFreeCancellation(offer: HotelOfferDTO): boolean {
  return offer.boardings.some((b) =>
    b.pax.some((p) =>
      p.rooms.some(
        (r) =>
          !r.notRefundable &&
          r.cancellationPolicies.some(
            (c) => c.nature === "BEFORE_ARRIVAL" && c.fees === 0,
          ),
      ),
    ),
  )
}

/** Vrai si l'offre a au moins une chambre disponible (pas en stop). */
function hasAvailableRoom(offer: HotelOfferDTO): boolean {
  return offer.boardings.some((b) =>
    b.pax.some((p) => p.rooms.some((r) => !r.stopReservation)),
  )
}

export function computeFacets(offers: HotelOfferDTO[]): HotelFacets {
  const starsMap = new Map<number, number>()
  const boardingsMap = new Map<string, number>()
  const facilitiesMap = new Map<string, number>()
  let priceMin = Infinity
  let priceMax = -Infinity
  let recommendedCount = 0
  let freeCancellationCount = 0
  let availableCount = 0

  for (const offer of offers) {
    const stars = offer.hotel.stars ?? 0
    if (stars > 0) {
      starsMap.set(stars, (starsMap.get(stars) ?? 0) + 1)
    }

    const seenBoardings = new Set<string>()
    for (const b of offer.boardings) {
      if (b.name && !seenBoardings.has(b.name)) {
        seenBoardings.add(b.name)
        boardingsMap.set(b.name, (boardingsMap.get(b.name) ?? 0) + 1)
      }
    }

    const seenFacilities = new Set<string>()
    for (const f of offer.hotel.facilities ?? []) {
      if (f.title && !seenFacilities.has(f.title)) {
        seenFacilities.add(f.title)
        facilitiesMap.set(f.title, (facilitiesMap.get(f.title) ?? 0) + 1)
      }
    }

    if (offer.fromPrice > 0) {
      priceMin = Math.min(priceMin, offer.fromPrice)
      priceMax = Math.max(priceMax, offer.fromPrice)
    }
    if (offer.recommended) recommendedCount += 1
    if (hasFreeCancellation(offer)) freeCancellationCount += 1
    if (hasAvailableRoom(offer)) availableCount += 1
  }

  if (!Number.isFinite(priceMin)) priceMin = 0
  if (!Number.isFinite(priceMax)) priceMax = 0

  return {
    stars: Array.from(starsMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.value - a.value),
    boardings: Array.from(boardingsMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    facilities: Array.from(facilitiesMap.entries())
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30),
    priceMin: Math.floor(priceMin),
    priceMax: Math.ceil(priceMax),
    recommendedCount,
    freeCancellationCount,
    availableCount,
  }
}

/** Applique le `filterState` à la liste d'offres. Renvoie une nouvelle liste filtrée. */
export function applyFilters(
  offers: HotelOfferDTO[],
  filters: HotelFilterState,
): HotelOfferDTO[] {
  return offers.filter((offer) => {
    if (filters.stars.length > 0) {
      const stars = offer.hotel.stars ?? 0
      if (!filters.stars.includes(stars)) return false
    }

    if (filters.boardings.length > 0) {
      const offerBoardings = offer.boardings.map((b) => b.name)
      if (!filters.boardings.some((b) => offerBoardings.includes(b)))
        return false
    }

    if (filters.facilities.length > 0) {
      const offerFacilities = (offer.hotel.facilities ?? []).map((f) => f.title)
      if (!filters.facilities.every((f) => offerFacilities.includes(f)))
        return false
    }

    if (filters.priceRange) {
      const [min, max] = filters.priceRange
      if (offer.fromPrice < min || offer.fromPrice > max) return false
    }

    if (filters.recommendedOnly && !offer.recommended) return false
    if (filters.freeCancellationOnly && !hasFreeCancellation(offer))
      return false
    if (filters.availableOnly && !hasAvailableRoom(offer)) return false

    return true
  })
}
