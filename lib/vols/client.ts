/**
 * Client Vols — Easy2Book
 *
 * Stub d'intégration API vols (Amadeus / Sabre / NDC).
 * L'architecture respecte le même pattern que lib/mygo/client.ts :
 *  - Zod validation des réponses
 *  - Circuit breaker partagé
 *  - Cache Redis avec fallback mémoire
 *
 * En attendant les credentials API, `searchFlights` retourne des fixtures
 * réalistes (mode démo) si FLIGHTS_API_KEY est absent.
 *
 * Variables d'environnement :
 *  - FLIGHTS_API_KEY       : clé API Amadeus / Sabre
 *  - FLIGHTS_API_BASE_URL  : ex. https://api.amadeus.com/v2
 *  - FLIGHTS_DEMO_MODE     : "true" pour forcer les fixtures
 */

import { z } from "zod"
import { memoize } from "@/lib/cache/redis"
import { search as virtualSearch } from "@/lib/vols/virtual-supplier/engine"
import { minutesToIso } from "@/lib/vols/virtual-supplier/catalog"

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const FlightSegmentSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  departureAt: z.string(),
  arrivalAt: z.string(),
  carrier: z.string(),
  flightNumber: z.string(),
  duration: z.string(),
  cabin: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]),
})

export const FlightOfferSchema = z.object({
  id: z.string(),
  segments: z.array(FlightSegmentSchema),
  stops: z.number(),
  totalDurationMinutes: z.number(),
  priceTnd: z.number(),
  currency: z.string().default("TND"),
  availableSeats: z.number().nullable(),
  refundable: z.boolean(),
  baggageKg: z.number().nullable(),
  source: z.string().default("amadeus"),
  /** Jeton signé serveur (Virtual Flight Supplier) à revalider pour réserver — voir lib/vols/booking-actions.ts. Absent en mode API réelle tant qu'aucun adaptateur de réservation n'y est branché. */
  offerToken: z.string().optional(),
})

export type FlightOffer = z.infer<typeof FlightOfferSchema>

export interface FlightSearchInput {
  originCode: string      // IATA airport code (ex: TUN)
  destinationCode: string // IATA airport code (ex: CDG)
  departureDate: string   // YYYY-MM-DD
  returnDate?: string     // YYYY-MM-DD (null = one-way)
  adults: number
  children?: number
  cabin?: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST"
}

export type FlightSearchResult =
  | { ok: true; offers: FlightOffer[]; searchId: string }
  | { ok: false; error: string; code: string }

// ---------------------------------------------------------------------------
// Mode démo — Virtual Flight Supplier
// ---------------------------------------------------------------------------
//
// Contrairement à l'ancien mode démo (3 offres statiques indépendantes de la
// route/date demandée), le mode démo appelle désormais un vrai moteur de
// fournisseur virtuel (lib/vols/virtual-supplier/engine.ts) : offres
// déterministes par route/date/cabine, disponibilité réelle suivie en
// mémoire, jeton signé à revalider pour réserver (voir
// lib/vols/guest-booking-actions.ts). Aucune réservation n'est possible sans
// repasser par ce moteur — le "demo mode" ne fabrique plus de données
// déconnectées du reste du parcours.

function buildVirtualOffers(input: FlightSearchInput): { offers: FlightOffer[]; searchId: string } {
  const { searchId, offers } = virtualSearch({
    origin: input.originCode,
    destination: input.destinationCode,
    departureDate: input.departureDate,
    returnDate: input.returnDate,
    adults: input.adults,
    children: input.children ?? 0,
    cabin: input.cabin ?? "ECONOMY",
  })

  const mapped: FlightOffer[] = offers.map((offer) => ({
    id: offer.offerId,
    segments: offer.segments.map((seg) => ({
      origin: seg.origin,
      destination: seg.destination,
      departureAt: seg.departureAt,
      arrivalAt: seg.arrivalAt,
      carrier: seg.carrier,
      flightNumber: seg.flightNumber,
      duration: minutesToIso(seg.durationMinutes),
      cabin: seg.cabin,
    })),
    stops: offer.stops,
    totalDurationMinutes: offer.totalDurationMinutes,
    priceTnd: offer.priceTnd,
    currency: offer.currency,
    availableSeats: offer.availableSeats,
    refundable: offer.refundable,
    baggageKg: offer.baggageKg,
    source: "virtual",
    offerToken: offer.token,
  }))

  return { offers: mapped, searchId }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export async function searchFlights(
  input: FlightSearchInput,
): Promise<FlightSearchResult> {
  const isDemoMode =
    !process.env.FLIGHTS_API_KEY || process.env.FLIGHTS_DEMO_MODE === "true"

  if (isDemoMode) {
    const { offers, searchId } = buildVirtualOffers(input)
    return { ok: true, offers, searchId }
  }

  const cacheKey = `e2b:vols:${input.originCode}-${input.destinationCode}-${input.departureDate}-${input.adults}`

  try {
    return await memoize(cacheKey, 300, async () => {
      const url = new URL(`${process.env.FLIGHTS_API_BASE_URL}/shopping/flight-offers`)
      url.searchParams.set("originLocationCode", input.originCode)
      url.searchParams.set("destinationLocationCode", input.destinationCode)
      url.searchParams.set("departureDate", input.departureDate)
      url.searchParams.set("adults", String(input.adults))
      if (input.children) url.searchParams.set("children", String(input.children))
      if (input.cabin) url.searchParams.set("travelClass", input.cabin)

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${process.env.FLIGHTS_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(12_000),
      })

      if (!res.ok) {
        throw new Error(`Flights API ${res.status}: ${res.statusText}`)
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
      code: "FLIGHTS_API_ERROR",
    }
  }
}
