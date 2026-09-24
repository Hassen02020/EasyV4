/**
 * Flight Filter Engine — Easy2Book Flight Puzzle
 *
 * Standalone, testable module for filtering and sorting FlightOffers.
 * Extracted from flight-results-content.tsx so the same logic can be
 * applied server-side (pre-snapshot filtering) and reused in tests.
 */

import type { FlightOffer } from "./client"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortMode = "recommended" | "price_asc" | "price_desc" | "duration_asc"

export interface FlightFilters {
  directOnly?: boolean
  refundableOnly?: boolean
  /** Maximum selling price (TND). */
  maxPriceTnd?: number
  /** IATA 2-letter codes — keep only offers from these carriers. */
  preferredAirlines?: string[]
  /** Local HH:MM — departure of first segment in first journey. */
  departureTimeRange?: { from: string; to: string }
  /** Local HH:MM — arrival of last segment in last journey. */
  arrivalTimeRange?: { from: string; to: string }
  maxDurationMinutes?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function offerSellingPrice(o: FlightOffer): number {
  return o.sellingAmount ?? o.priceTnd ?? 0
}

function offerTotalDuration(o: FlightOffer): number {
  return o.totalDurationMinutes
}

function firstDepartureHHMM(o: FlightOffer): string {
  const seg = o.journeys[0]?.segments[0]
  if (!seg) return "00:00"
  return seg.departure.slice(11, 16)
}

function lastArrivalHHMM(o: FlightOffer): string {
  const lastJourney = o.journeys[o.journeys.length - 1]
  const lastSeg = lastJourney?.segments[lastJourney.segments.length - 1]
  if (!lastSeg) return "23:59"
  return lastSeg.arrival.slice(11, 16)
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function offerStops(o: FlightOffer): number {
  // Total technical stops across all journeys
  return o.journeys.reduce((sum, j) => sum + j.layovers.length, 0)
}

function offerCarriers(o: FlightOffer): string[] {
  return [
    ...new Set(
      o.journeys.flatMap((j) =>
        j.segments.map((s) => s.marketingCarrier),
      ),
    ),
  ]
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

export function applyFilters(offers: FlightOffer[], filters: FlightFilters): FlightOffer[] {
  return offers.filter((o) => {
    if (filters.directOnly && offerStops(o) > 0) return false
    if (filters.refundableOnly && !o.refundable) return false
    if (filters.maxPriceTnd != null && offerSellingPrice(o) > filters.maxPriceTnd) return false
    if (filters.maxDurationMinutes != null && offerTotalDuration(o) > filters.maxDurationMinutes) return false

    if (filters.preferredAirlines && filters.preferredAirlines.length > 0) {
      const carriers = offerCarriers(o)
      if (!carriers.some((c) => filters.preferredAirlines!.includes(c))) return false
    }

    if (filters.departureTimeRange) {
      const depMin = toMinutes(firstDepartureHHMM(o))
      const fromMin = toMinutes(filters.departureTimeRange.from)
      const toMin = toMinutes(filters.departureTimeRange.to)
      if (depMin < fromMin || depMin > toMin) return false
    }

    if (filters.arrivalTimeRange) {
      const arrMin = toMinutes(lastArrivalHHMM(o))
      const fromMin = toMinutes(filters.arrivalTimeRange.from)
      const toMin = toMinutes(filters.arrivalTimeRange.to)
      if (arrMin < fromMin || arrMin > toMin) return false
    }

    return true
  })
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

export function sortOffers(offers: FlightOffer[], mode: SortMode): FlightOffer[] {
  const copy = [...offers]
  switch (mode) {
    case "price_asc":
      return copy.sort((a, b) => offerSellingPrice(a) - offerSellingPrice(b))
    case "price_desc":
      return copy.sort((a, b) => offerSellingPrice(b) - offerSellingPrice(a))
    case "duration_asc":
      return copy.sort((a, b) => offerTotalDuration(a) - offerTotalDuration(b))
    case "recommended":
    default:
      return copy.sort((a, b) => {
        const stopsA = offerStops(a)
        const stopsB = offerStops(b)
        if (stopsA !== stopsB) return stopsA - stopsB
        return offerSellingPrice(a) - offerSellingPrice(b)
      })
  }
}
