/**
 * Sort Engine — trie côté client un ensemble d'offres déjà chargées.
 *
 * Comme `applyFilters`/`computeFacets` (lib/mygo/facets.ts), ces fonctions
 * sont pures et ne déclenchent JAMAIS un nouvel appel myGo XML : le tri
 * s'applique sur les offres déjà reçues (voir app/hotels/search/page.tsx).
 */

import type { HotelOfferDTO } from "./types"
import { selectBestRate } from "./best-rate"

export type HotelSortMode = "recommended" | "price_asc" | "price_desc" | "best_deal"

export const DEFAULT_SORT_MODE: HotelSortMode = "recommended"

export const SORT_OPTIONS: { value: HotelSortMode; label: string }[] = [
  { value: "recommended", label: "Recommandés" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "best_deal", label: "Meilleur rapport qualité/prix" },
]

/**
 * Prix "réellement affiché" pour une offre au moment du tri — c'est-à-dire
 * le même prix que celui montré sur la card (`selectBestRate`, réagit au
 * filtre de pension actif), pas systématiquement `fromPrice` (le moins cher
 * toutes pensions confondues). Sans ça, "Prix croissant" avec un filtre
 * "All Inclusive" actif pourrait trier sur le prix Petit-déjeuner d'un
 * hôtel tout en affichant son prix All Inclusive sur la card — un ordre
 * visuellement incohérent avec les prix réellement montrés au client.
 */
function displayPrice(offer: HotelOfferDTO, activeBoardings: string[]): number {
  return selectBestRate(offer, activeBoardings)?.price ?? offer.fromPrice
}

/**
 * Score "meilleur rapport qualité/prix" — plus bas = meilleur.
 * Formule documentée et volontairement simple (jamais de score opaque) :
 * `prix affiché / max(stars, 1)`, c'est-à-dire le prix ramené au nombre
 * d'étoiles réel de l'hôtel. myGo n'expose aucun "prix barré"/pourcentage
 * de remise fiable — on ne fabrique donc aucune notion de rabais.
 */
function bestDealScore(offer: HotelOfferDTO, activeBoardings: string[]): number {
  const stars = Math.max(offer.hotel.stars ?? 0, 1)
  return displayPrice(offer, activeBoardings) / stars
}

export function sortOffers(
  offers: HotelOfferDTO[],
  mode: HotelSortMode,
  /** Filtre de pension actif (`HotelFilterState.boardings`) — voir `displayPrice`. */
  activeBoardings: string[] = [],
): HotelOfferDTO[] {
  const copy = [...offers]
  switch (mode) {
    case "price_asc":
      return copy.sort(
        (a, b) => displayPrice(a, activeBoardings) - displayPrice(b, activeBoardings),
      )
    case "price_desc":
      return copy.sort(
        (a, b) => displayPrice(b, activeBoardings) - displayPrice(a, activeBoardings),
      )
    case "best_deal":
      return copy.sort(
        (a, b) => bestDealScore(a, activeBoardings) - bestDealScore(b, activeBoardings),
      )
    case "recommended":
    default:
      // Offres "Recommandé" (myGo) d'abord, puis prix croissant en
      // départage — deux critères réels et documentés, jamais un score
      // arbitraire non expliqué.
      return copy.sort((a, b) => {
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
        return displayPrice(a, activeBoardings) - displayPrice(b, activeBoardings)
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
