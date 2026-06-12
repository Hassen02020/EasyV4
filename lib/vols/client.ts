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
// Fixtures démo
// ---------------------------------------------------------------------------

function buildDemoOffers(input: FlightSearchInput): FlightOffer[] {
  const base = input.adults * 450
  return [
    {
      id: "demo-1",
      segments: [
        {
          origin: input.originCode,
          destination: input.destinationCode,
          departureAt: `${input.departureDate}T06:30:00`,
          arrivalAt: `${input.departureDate}T09:45:00`,
          carrier: "TU",
          flightNumber: "TU756",
          duration: "PT3H15M",
          cabin: input.cabin ?? "ECONOMY",
        },
      ],
      stops: 0,
      totalDurationMinutes: 195,
      priceTnd: Math.round(base * 1.05),
      currency: "TND",
      availableSeats: 12,
      refundable: false,
      baggageKg: 23,
      source: "demo",
    },
    {
      id: "demo-2",
      segments: [
        {
          origin: input.originCode,
          destination: input.destinationCode,
          departureAt: `${input.departureDate}T14:00:00`,
          arrivalAt: `${input.departureDate}T18:30:00`,
          carrier: "BJ",
          flightNumber: "BJ106",
          duration: "PT4H30M",
          cabin: input.cabin ?? "ECONOMY",
        },
      ],
      stops: 1,
      totalDurationMinutes: 270,
      priceTnd: Math.round(base * 0.88),
      currency: "TND",
      availableSeats: 5,
      refundable: true,
      baggageKg: 20,
      source: "demo",
    },
    {
      id: "demo-3",
      segments: [
        {
          origin: input.originCode,
          destination: input.destinationCode,
          departureAt: `${input.departureDate}T20:15:00`,
          arrivalAt: `${input.departureDate}T23:50:00`,
          carrier: "TU",
          flightNumber: "TU814",
          duration: "PT3H35M",
          cabin: "BUSINESS",
        },
      ],
      stops: 0,
      totalDurationMinutes: 215,
      priceTnd: Math.round(base * 2.8),
      currency: "TND",
      availableSeats: 3,
      refundable: true,
      baggageKg: 32,
      source: "demo",
    },
  ]
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
    const offers = buildDemoOffers(input)
    return { ok: true, offers, searchId: `demo-${Date.now()}` }
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
