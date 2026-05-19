/**
 * Inventaire de chambres mocké pour la page détail `/pro/hotels/[id]`.
 *
 * Pour chaque hôtel, on génère :
 *  - 3 à 5 catégories de chambre (Standard, Supérieure, Vue mer, Suite…)
 *  - 1 à 3 arrangements (Single, Double, Triple, Familiale)
 *  - les options de pension supportées par l'hôtel
 *
 * Les prix sont dérivés du prix net agence de la catégorie d'entrée afin de
 * rester cohérents avec la SERP. Sera remplacé par MyGo réel en phase 9.
 */

import {
  type ProHotel,
  type HotelBoarding,
  BOARDING_LABEL,
  BOARDING_SHORT,
  minBoardingPrice,
} from "./hotels-fixture"

export type RoomCategory = {
  id: string
  name: string
  description: string
  multiplier: number
}

export type RoomArrangement = {
  id: string
  label: string
  maxAdults: number
  maxChildren: number
  /** Surcharge appliquée à la catégorie (en %). 0 = pas de supplément. */
  surcharge: number
}

export type RoomOffer = {
  id: string
  category: RoomCategory
  arrangement: RoomArrangement
  boarding: HotelBoarding
  /** Prix TND TTC pour 2 ad / 4 nuits avant marge. */
  price: number
  /** Texte de conditions associé (annulation, paiement…). */
  conditions: string
  available: number
}

const BASE_CATEGORIES: RoomCategory[] = [
  {
    id: "standard",
    name: "Chambre Standard",
    description: "Climatisation, salle de bain privée, télévision",
    multiplier: 1,
  },
  {
    id: "superior",
    name: "Chambre Supérieure",
    description: "Vue jardin, balcon, lit king-size",
    multiplier: 1.18,
  },
  {
    id: "sea-view",
    name: "Chambre Vue Mer",
    description: "Balcon ou terrasse avec vue Méditerranée",
    multiplier: 1.35,
  },
  {
    id: "junior-suite",
    name: "Junior Suite",
    description: "Coin salon séparé, mini-bar, peignoirs",
    multiplier: 1.62,
  },
  {
    id: "suite",
    name: "Suite Familiale",
    description: "2 chambres, salon, jusqu'à 5 personnes",
    multiplier: 2.05,
  },
]

const ARRANGEMENTS: RoomArrangement[] = [
  {
    id: "double",
    label: "Double (2 adultes)",
    maxAdults: 2,
    maxChildren: 1,
    surcharge: 0,
  },
  {
    id: "triple",
    label: "Triple (3 adultes)",
    maxAdults: 3,
    maxChildren: 1,
    surcharge: 0.22,
  },
  {
    id: "family",
    label: "Familiale (2 ad + 2 enf)",
    maxAdults: 2,
    maxChildren: 2,
    surcharge: 0.32,
  },
  {
    id: "single",
    label: "Single (1 adulte)",
    maxAdults: 1,
    maxChildren: 0,
    surcharge: -0.18,
  },
]

const CONDITIONS = [
  "Annulation gratuite jusqu'à 48h avant l'arrivée",
  "Acompte 30 % à la réservation",
  "Non remboursable — tarif réduit",
  "Paiement à l'hôtel possible",
  "Annulation gratuite jusqu'à 7 jours avant",
]

function hashSeed(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0
  }
  return h
}

/**
 * Liste les offres disponibles pour un hôtel donné.
 * La génération est déterministe (basée sur le slug de l'hôtel).
 */
export function listRoomOffers(hotel: ProHotel): RoomOffer[] {
  const seed = hashSeed(hotel.id)
  const basePrice = minBoardingPrice(hotel)
  const categoriesCount = 3 + (seed % 3) // 3..5
  const categories = BASE_CATEGORIES.slice(0, categoriesCount)

  const offers: RoomOffer[] = []
  let counter = 0

  categories.forEach((cat) => {
    // Toujours Double, parfois Triple + Familiale, rarement Single
    const arrangements = [ARRANGEMENTS[0]!] // Double
    if ((seed + counter) % 2 === 0) arrangements.push(ARRANGEMENTS[1]!) // Triple
    if (cat.id === "suite" || cat.id === "junior-suite")
      arrangements.push(ARRANGEMENTS[2]!) // Family
    if (cat.id === "standard" && seed % 3 === 0)
      arrangements.push(ARRANGEMENTS[3]!) // Single

    arrangements.forEach((arr) => {
      hotel.boardings.forEach((boarding) => {
        const price =
          boarding.price *
          cat.multiplier *
          (1 + arr.surcharge) *
          (basePrice > 0 ? 1 : 1)
        const condIndex = (seed + counter) % CONDITIONS.length
        offers.push({
          id: `${hotel.id}-${cat.id}-${arr.id}-${boarding.type}`,
          category: cat,
          arrangement: arr,
          boarding: boarding.type,
          price: Math.round(price * 1000) / 1000,
          conditions: CONDITIONS[condIndex]!,
          available: 1 + ((seed + counter) % 5),
        })
        counter += 1
      })
    })
  })

  return offers
}

export { BOARDING_LABEL, BOARDING_SHORT }
