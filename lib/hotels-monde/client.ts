/**
 * Client Hôtels Monde — Easy2Book
 *
 * Stub d'intégration API hôtels monde (Expedia Rapid API / Booking.com
 * Demand API — le choix exact du fournisseur est une décision commerciale
 * non tranchée, voir feature-flags/index.ts:"hotels_monde"). Même pattern
 * que lib/vols/client.ts (lui-même aligné sur lib/mygo/client.ts) :
 *  - Zod validation des réponses
 *  - Cache Redis (memoize) une fois un vrai fournisseur branché
 *  - En attendant les credentials API, `searchWorldHotels` appelle un vrai
 *    moteur de fournisseur virtuel (Virtual World Hotel Supplier, voir
 *    lib/hotels-monde/virtual-supplier/engine.ts) — offres déterministes
 *    par destination/dates, disponibilité réelle suivie en mémoire, jeton
 *    signé à revalider pour réserver (voir
 *    lib/hotels-monde/guest-booking-actions.ts). Toujours marquées
 *    `source: "virtual"`, jamais présentées comme un vrai inventaire.
 *
 * Variables d'environnement :
 *  - WORLD_HOTELS_API_KEY       : clé API du fournisseur choisi
 *  - WORLD_HOTELS_API_BASE_URL  : ex. https://api.ean.com/v3
 *  - WORLD_HOTELS_DEMO_MODE     : "true" pour forcer le mode virtuel
 */

import { z } from "zod"
import { memoize } from "@/lib/cache/redis"
import { destinationByValue } from "./search-state"
import { search as virtualSearch } from "@/lib/hotels-monde/virtual-supplier/engine"

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const WorldHotelOfferSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  stars: z.number().min(1).max(5).nullable(),
  /** Note voyageurs sur 10, comme les agrégateurs (Booking/Expedia). */
  rating: z.number().min(0).max(10).nullable(),
  reviewCount: z.number().nullable(),
  thumbnailUrl: z.string().nullable(),
  pricePerNightTnd: z.number(),
  totalPriceTnd: z.number(),
  nights: z.number(),
  currency: z.string().default("TND"),
  refundable: z.boolean(),
  breakfastIncluded: z.boolean(),
  distanceFromCenterKm: z.number().nullable(),
  source: z.string().default("demo"),
  /** Jeton signé serveur (Virtual World Hotel Supplier) à revalider pour réserver — voir lib/hotels-monde/guest-booking-actions.ts. Absent en mode API réelle tant qu'aucun adaptateur de réservation n'y est branché. */
  offerToken: z.string().optional(),
})

export type WorldHotelOffer = z.infer<typeof WorldHotelOfferSchema>

export interface WorldHotelSearchInput {
  destination: string // valeur POPULAR_DESTINATIONS (ex: "istanbul")
  checkIn: string // YYYY-MM-DD
  checkOut: string // YYYY-MM-DD
  nights: number
  adults: number
  rooms: number
  stars?: number
}

export type WorldHotelSearchResult =
  | { ok: true; offers: WorldHotelOffer[]; searchId: string }
  | { ok: false; error: string; code: string }

// ---------------------------------------------------------------------------
// Mode démo — Virtual World Hotel Supplier
// ---------------------------------------------------------------------------
//
// Contrairement à l'ancien mode démo (3 fixtures statiques indépendantes de
// la destination/dates demandées), le mode démo appelle désormais un vrai
// moteur de fournisseur virtuel (lib/hotels-monde/virtual-supplier/engine.ts) :
// offres déterministes par destination/dates/étoiles, disponibilité réelle
// suivie en mémoire, jeton signé à revalider pour réserver (voir
// lib/hotels-monde/guest-booking-actions.ts). Aucune réservation n'est
// possible sans repasser par ce moteur — le "demo mode" ne fabrique plus de
// données déconnectées du reste du parcours.

function buildVirtualOffers(input: WorldHotelSearchInput): { offers: WorldHotelOffer[]; searchId: string } {
  const destination = destinationByValue(input.destination)
  const city = destination?.city ?? input.destination
  const country = destination?.country ?? "—"

  const { searchId, offers } = virtualSearch({
    destination: input.destination,
    city,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: input.nights,
    adults: input.adults,
    rooms: input.rooms,
    stars: input.stars,
  })

  const mapped: WorldHotelOffer[] = offers.map((offer) => ({
    id: offer.offerId,
    name: offer.name,
    city,
    country,
    stars: offer.stars,
    rating: offer.rating,
    reviewCount: offer.reviewCount,
    thumbnailUrl: null,
    pricePerNightTnd: offer.pricePerNightTnd,
    totalPriceTnd: offer.totalPriceTnd,
    nights: offer.nights,
    currency: offer.currency,
    refundable: offer.refundable,
    breakfastIncluded: offer.breakfastIncluded,
    distanceFromCenterKm: offer.distanceFromCenterKm,
    source: "virtual",
    offerToken: offer.token,
  }))

  return { offers: mapped, searchId }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export async function searchWorldHotels(
  input: WorldHotelSearchInput,
): Promise<WorldHotelSearchResult> {
  const isDemoMode =
    !process.env.WORLD_HOTELS_API_KEY || process.env.WORLD_HOTELS_DEMO_MODE === "true"

  if (isDemoMode) {
    const { offers, searchId } = buildVirtualOffers(input)
    return { ok: true, offers, searchId }
  }

  const cacheKey = `e2b:hotels-monde:${input.destination}-${input.checkIn}-${input.checkOut}-${input.adults}-${input.rooms}`

  try {
    return await memoize(cacheKey, 300, async () => {
      const url = new URL(`${process.env.WORLD_HOTELS_API_BASE_URL}/shop/hotels`)
      url.searchParams.set("destination", input.destination)
      url.searchParams.set("checkin", input.checkIn)
      url.searchParams.set("checkout", input.checkOut)
      url.searchParams.set("adults", String(input.adults))
      url.searchParams.set("rooms", String(input.rooms))
      if (input.stars) url.searchParams.set("stars", String(input.stars))

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${process.env.WORLD_HOTELS_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(12_000),
      })

      if (!res.ok) {
        throw new Error(`World Hotels API ${res.status}: ${res.statusText}`)
      }

      const json = await res.json()
      const offers = (json.data ?? []).map((o: unknown, i: number) => ({
        id: `offer-${i}`,
        ...(o as Record<string, unknown>),
      }))

      return {
        ok: true as const,
        offers,
        searchId: json.meta?.searchId ?? `s-${Date.now()}`,
      }
    })
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue",
      code: "WORLD_HOTELS_API_ERROR",
    }
  }
}
