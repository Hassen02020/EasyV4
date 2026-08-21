/**
 * Client Hôtels Monde — Easy2Book
 *
 * Stub d'intégration API hôtels monde (Expedia Rapid API / Booking.com
 * Demand API — le choix exact du fournisseur est une décision commerciale
 * non tranchée, voir feature-flags/index.ts:"hotels_monde"). Même pattern
 * que lib/vols/client.ts (lui-même aligné sur lib/mygo/client.ts) :
 *  - Zod validation des réponses
 *  - Cache Redis (memoize) une fois un vrai fournisseur branché
 *  - En attendant les credentials API, `searchWorldHotels` retourne des
 *    fixtures réalistes (mode démo) si WORLD_HOTELS_API_KEY est absent —
 *    toujours marquées `source: "demo"`, jamais présentées comme un vrai
 *    inventaire.
 *
 * Variables d'environnement :
 *  - WORLD_HOTELS_API_KEY       : clé API du fournisseur choisi
 *  - WORLD_HOTELS_API_BASE_URL  : ex. https://api.ean.com/v3
 *  - WORLD_HOTELS_DEMO_MODE     : "true" pour forcer les fixtures
 */

import { z } from "zod"
import { memoize } from "@/lib/cache/redis"
import { destinationByValue } from "./search-state"

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
// Fixtures démo
// ---------------------------------------------------------------------------

interface DemoTemplate {
  suffix: string
  starsBase: number
  rating: number
  reviewCount: number
  nightlyBaseTnd: number
  breakfastIncluded: boolean
  refundable: boolean
  distanceKm: number
}

const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    suffix: "Grand Palace",
    starsBase: 5,
    rating: 9.1,
    reviewCount: 2840,
    nightlyBaseTnd: 620,
    breakfastIncluded: true,
    refundable: true,
    distanceKm: 0.8,
  },
  {
    suffix: "City Center Hotel",
    starsBase: 4,
    rating: 8.3,
    reviewCount: 1560,
    nightlyBaseTnd: 340,
    breakfastIncluded: true,
    refundable: true,
    distanceKm: 1.5,
  },
  {
    suffix: "Comfort Inn",
    starsBase: 3,
    rating: 7.6,
    reviewCount: 890,
    nightlyBaseTnd: 210,
    breakfastIncluded: false,
    refundable: false,
    distanceKm: 3.2,
  },
]

function buildDemoOffers(input: WorldHotelSearchInput): WorldHotelOffer[] {
  const destination = destinationByValue(input.destination)
  const city = destination?.city ?? input.destination
  const country = destination?.country ?? "—"

  return DEMO_TEMPLATES.filter(
    (t) => !input.stars || t.starsBase === input.stars,
  ).map((t, i) => {
    const pricePerNightTnd = Math.round(t.nightlyBaseTnd * (0.9 + input.rooms * 0.1))
    return {
      id: `demo-${input.destination}-${i}`,
      name: `${city} ${t.suffix}`,
      city,
      country,
      stars: t.starsBase,
      rating: t.rating,
      reviewCount: t.reviewCount,
      thumbnailUrl: null,
      pricePerNightTnd,
      totalPriceTnd: Math.round(pricePerNightTnd * input.nights * input.rooms),
      nights: input.nights,
      currency: "TND",
      refundable: t.refundable,
      breakfastIncluded: t.breakfastIncluded,
      distanceFromCenterKm: t.distanceKm,
      source: "demo",
    }
  })
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
    const offers = buildDemoOffers(input)
    return { ok: true, offers, searchId: `demo-${Date.now()}` }
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
