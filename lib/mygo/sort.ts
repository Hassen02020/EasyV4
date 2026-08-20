/**
 * Sort Engine — trie côté client un ensemble d'offres déjà chargées.
 *
 * Comme `applyFilters`/`computeFacets` (lib/mygo/facets.ts), ces fonctions
 * sont pures et ne déclenchent JAMAIS un nouvel appel myGo XML : le tri
 * s'applique sur les offres déjà reçues (voir app/hotels/search/page.tsx).
 */

import type { HotelOfferDTO } from "./types"

export type HotelSortMode = "recommended" | "price_asc" | "price_desc" | "best_deal"

export const DEFAULT_SORT_MODE: HotelSortMode = "recommended"

export const SORT_OPTIONS: { value: HotelSortMode; label: string }[] = [
  { value: "recommended", label: "Recommandés" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "best_deal", label: "Meilleur rapport qualité/prix" },
]

/**
 * Score "meilleur rapport qualité/prix" — plus bas = meilleur.
 * Formule documentée et volontairement simple (jamais de score opaque) :
 * `fromPrice / max(stars, 1)`, c'est-à-dire le prix ramené au nombre
 * d'étoiles réel de l'hôtel. myGo n'expose aucun "prix barré"/pourcentage
 * de remise fiable — on ne fabrique donc aucune notion de rabais.
 */
function bestDealScore(offer: HotelOfferDTO): number {
  const stars = Math.max(offer.hotel.stars ?? 0, 1)
  return offer.fromPrice / stars
}

export function sortOffers(
  offers: HotelOfferDTO[],
  mode: HotelSortMode,
): HotelOfferDTO[] {
  const copy = [...offers]
  switch (mode) {
    case "price_asc":
      return copy.sort((a, b) => a.fromPrice - b.fromPrice)
    case "price_desc":
      return copy.sort((a, b) => b.fromPrice - a.fromPrice)
    case "best_deal":
      return copy.sort((a, b) => bestDealScore(a) - bestDealScore(b))
    case "recommended":
    default:
      // Offres "Recommandé" (myGo) d'abord, puis prix croissant en
      // départage — deux critères réels et documentés, jamais un score
      // arbitraire non expliqué.
      return copy.sort((a, b) => {
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
        return a.fromPrice - b.fromPrice
      })
  }
}

export function isHotelSortMode(value: string | null): value is HotelSortMode {
  return (
    value === "recommended" ||
    value === "price_asc" ||
    value === "price_desc" ||
    value === "best_deal"
  )
}
