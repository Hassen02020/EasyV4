/**
 * Génération déterministe d'offres d'hôtels pour le Virtual World Hotel
 * Supplier — même philosophie que le catalogue Vols
 * (lib/vols/virtual-supplier/catalog.ts) : pour une destination/dates
 * données, TOUJOURS les mêmes offres de base (noms/étoiles/prix), afin
 * qu'un test répété reste reproductible ; seule la disponibilité réelle
 * (lib/hotels-monde/virtual-supplier/inventory-store.ts) bouge avec les
 * réservations/annulations effectuées pendant le run.
 */

import { hashSeed, mulberry32Like } from "./rng"

export interface VirtualWorldHotelOffer {
  offerId: string
  name: string
  stars: number
  rating: number
  reviewCount: number
  nightlyBaseTnd: number
  refundable: boolean
  breakfastIncluded: boolean
  distanceFromCenterKm: number
}

interface HotelTemplate {
  suffix: string
  starsBase: number
  ratingBase: number
  nightlyBaseTnd: number
}

const TEMPLATES: HotelTemplate[] = [
  { suffix: "Grand Palace", starsBase: 5, ratingBase: 9.1, nightlyBaseTnd: 620 },
  { suffix: "Royal Resort & Spa", starsBase: 5, ratingBase: 8.9, nightlyBaseTnd: 580 },
  { suffix: "City Center Hotel", starsBase: 4, ratingBase: 8.3, nightlyBaseTnd: 340 },
  { suffix: "Boutique Suites", starsBase: 4, ratingBase: 8.1, nightlyBaseTnd: 310 },
  { suffix: "Comfort Inn", starsBase: 3, ratingBase: 7.6, nightlyBaseTnd: 210 },
  { suffix: "Budget Lodge", starsBase: 2, ratingBase: 6.8, nightlyBaseTnd: 130 },
]

/** Génère 3 à 6 offres d'hôtels déterministes pour cette destination/dates, filtrées sur `stars` si fourni. */
export function generateOffers(input: {
  destination: string
  city: string
  checkIn: string
  checkOut: string
  stars?: number
}): VirtualWorldHotelOffer[] {
  const seed = hashSeed(`${input.destination}:${input.checkIn}:${input.checkOut}`)
  const rng = mulberry32Like(seed)
  const offerCount = 4 + Math.floor(rng() * 3) // 4..6

  const templates = [...TEMPLATES]
  const offers: VirtualWorldHotelOffer[] = []
  for (let i = 0; i < offerCount && templates.length > 0; i++) {
    const idx = Math.floor(rng() * templates.length)
    const t = templates.splice(idx, 1)[0]!
    if (input.stars && t.starsBase !== input.stars) continue

    const priceVariance = 0.9 + rng() * 0.3 // 0.90..1.20
    const ratingVariance = (rng() - 0.5) * 0.4 // ±0.2
    offers.push({
      offerId: `${input.destination}-${input.checkIn}-${t.suffix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: `${input.city} ${t.suffix}`,
      stars: t.starsBase,
      rating: Math.round(Math.min(10, Math.max(0, t.ratingBase + ratingVariance)) * 10) / 10,
      reviewCount: 300 + Math.floor(rng() * 3200),
      nightlyBaseTnd: Math.round(t.nightlyBaseTnd * priceVariance),
      refundable: rng() < 0.55,
      breakfastIncluded: rng() < 0.6,
      distanceFromCenterKm: Math.round((0.3 + rng() * 5.5) * 10) / 10,
    })
  }
  // Si le filtre `stars` a tout éliminé (aucun template ne correspond dans
  // ce tirage), régénère sans filtre plutôt que de renvoyer un résultat
  // vide silencieux — un vrai fournisseur GDS n'exclut jamais une catégorie
  // entière faute de tirage aléatoire favorable.
  if (offers.length === 0 && input.stars) {
    const fallback = TEMPLATES.find((t) => t.starsBase === input.stars)
    if (fallback) {
      const priceVariance = 0.9 + rng() * 0.3
      offers.push({
        offerId: `${input.destination}-${input.checkIn}-${fallback.suffix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: `${input.city} ${fallback.suffix}`,
        stars: fallback.starsBase,
        rating: fallback.ratingBase,
        reviewCount: 300 + Math.floor(rng() * 3200),
        nightlyBaseTnd: Math.round(fallback.nightlyBaseTnd * priceVariance),
        refundable: rng() < 0.55,
        breakfastIncluded: rng() < 0.6,
        distanceFromCenterKm: Math.round((0.3 + rng() * 5.5) * 10) / 10,
      })
    }
  }
  return offers
}
