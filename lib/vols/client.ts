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
import {
  createVirtualFlightDriver,
  createFlightApiDriver,
  searchAcrossFlightDrivers,
} from "./supplier-drivers"

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const FlightSegmentSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  departure: z.string(),
  arrival: z.string(),
  marketingCarrier: z.string(),
  operatingCarrier: z.string(),
  marketingFlightNumber: z.string(),
  operatingFlightNumber: z.string().optional(),
  durationMinutes: z.number(),
  stops: z.number(),
  equipment: z.string().optional(),
  cabin: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]),
  bookingClass: z.string().optional(),
  fareBrandId: z.string().optional(),
})

const LayoverSchema = z.object({
  airport: z.string(),
  durationMinutes: z.number(),
  isOvernightLayover: z.boolean(),
  terminalChange: z.boolean().optional(),
})

export const FlightJourneySchema = z.object({
  origin: z.string(),
  destination: z.string(),
  departureDate: z.string(),
  segments: z.array(FlightSegmentSchema),
  layovers: z.array(LayoverSchema),
})

export const FlightOfferSchema = z.object({
  id: z.string(),
  /** Structured journeys (legs) — preferred over flat segments. */
  journeys: z.array(FlightJourneySchema),
  stops: z.number(),
  totalDurationMinutes: z.number(),
  /** @deprecated use sellingAmount — kept for backward compat */
  priceTnd: z.number().optional(),
  /** Selling price shown to client (includes fees + markup). */
  sellingAmount: z.number().optional(),
  sellingCurrency: z.string().optional(),
  currency: z.string().default("TND"),
  availableSeats: z.number().nullable(),
  refundable: z.boolean(),
  baggageKg: z.number().nullable(),
  source: z.string().default("virtual"),
  /** Immutable price snapshot ID — use this to request a ticket, not the price. */
  snapshotId: z.string().optional(),
  expiresAt: z.string().optional(),
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
// Client
// ---------------------------------------------------------------------------
//
// Chantier 7 (Multi-supplier Hub, fondation minimale) : les deux chemins
// qui existaient ici (fournisseur virtuel déterministe / appel API réel)
// sont désormais deux `FlightSupplierDriver` orchestrés par
// `searchAcrossFlightDrivers()` (lib/vols/supplier-drivers.ts) au lieu
// d'un `if/else` figé — un futur second fournisseur réel s'ajoute à la
// liste de drivers, sans réécrire cette fonction. Comportement inchangé
// aujourd'hui : les deux drivers restent mutuellement exclusifs (voir
// isDemoMode() dans supplier-drivers.ts), donc toujours exactement un seul
// CONFIGURED.

export async function searchFlights(
  input: FlightSearchInput,
): Promise<FlightSearchResult> {
  return searchAcrossFlightDrivers(
    [createVirtualFlightDriver(), createFlightApiDriver()],
    input,
  )
}
