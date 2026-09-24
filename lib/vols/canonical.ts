/**
 * Canonical Flight Types — Easy2Book Flight Puzzle
 *
 * Provider-agnostic core types. No GDS-specific fields leak beyond adapters.
 * All layers above adapters (Orchestrator, Commercial, Snapshot, UI) use
 * these types exclusively.
 */

// ---------------------------------------------------------------------------
// Trip type
// ---------------------------------------------------------------------------

export type TripType = "ONE_WAY" | "ROUND_TRIP" | "MULTI_CITY"

// ---------------------------------------------------------------------------
// Segment (one flight leg: one aircraft, one departure, one arrival)
// ---------------------------------------------------------------------------

export interface CanonicalSegment {
  origin: string          // IATA 3-letter code
  destination: string     // IATA 3-letter code
  departure: string       // ISO-8601 datetime with offset
  arrival: string         // ISO-8601 datetime with offset
  airline: string         // 2-letter IATA carrier code
  flightNumber: string    // e.g. "TU 745"
  durationMinutes: number
  stops: number           // 0 = direct
  equipment?: string      // aircraft type, e.g. "B737"
  cabin: CabinClass
  bookingClass?: string   // fare basis class letter
}

export type CabinClass = "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST"

// ---------------------------------------------------------------------------
// Fare
// ---------------------------------------------------------------------------

export interface CanonicalFare {
  currency: string         // 3-letter ISO currency (supplier currency)
  baseAmount: number       // fare base, before taxes
  taxAmount: number
  totalAmount: number      // baseAmount + taxAmount, per-pax
  passengerType: "ADT" | "CHD" | "INF"
  count: number            // number of passengers at this fare
}

// ---------------------------------------------------------------------------
// Baggage
// ---------------------------------------------------------------------------

export interface CanonicalBaggage {
  cabin: boolean
  checkedPieces?: number
  checkedKg?: number
  description?: string
}

// ---------------------------------------------------------------------------
// Fare rules
// ---------------------------------------------------------------------------

export interface CanonicalFareRules {
  refundable: boolean
  changeable: boolean
  /** Penalty amount in supplier currency, if applicable. */
  changePenaltyAmount?: number
  changePenaltyCurrency?: string
  /** Human-readable fare conditions summary (from provider). */
  conditions?: string
}

// ---------------------------------------------------------------------------
// Provider reference (opaque — never inspected outside adapters)
// ---------------------------------------------------------------------------

export interface CanonicalProviderReference {
  /** Adapter name: "virtual" | "amadeus" | "travelport" | "sabre" */
  provider: string
  /** Provider-side offer/pricing ID (opaque string). */
  providerOfferId: string
  /** Raw provider pricing token/response needed for recheck/book. */
  pricingToken?: string
}

// ---------------------------------------------------------------------------
// Itinerary (the full canonical offer)
// ---------------------------------------------------------------------------

export interface CanonicalItinerary {
  tripType: TripType
  /**
   * Ordered segments across all legs.
   * ONE_WAY  : segments for TUN → CDG
   * ROUND_TRIP: segments for TUN → CDG, then CDG → TUN
   * MULTI_CITY: segments for each city pair in order
   */
  segments: CanonicalSegment[]
  fares: CanonicalFare[]
  baggage: CanonicalBaggage
  fareRules: CanonicalFareRules
  provider: CanonicalProviderReference
  /** Total supplier price (all fares summed, all pax). */
  supplierTotalAmount: number
  supplierCurrency: string
  /** Number of available seats (null = unknown). */
  availableSeats: number | null
}

// ---------------------------------------------------------------------------
// Search request (canonical — adapters translate to/from provider format)
// ---------------------------------------------------------------------------

export interface CanonicalSearchSegment {
  origin: string
  destination: string
  departureDate: string  // YYYY-MM-DD
}

export interface CanonicalSearchRequest {
  tripType: TripType
  /** Always present for ONE_WAY / ROUND_TRIP. First segment for MULTI_CITY. */
  origin: string
  destination: string
  departureDate: string
  returnDate?: string          // ROUND_TRIP only
  segments?: CanonicalSearchSegment[]  // MULTI_CITY — overrides origin/destination/date
  adults: number
  children: number
  infants: number
  cabin: CabinClass
  currency: string
}

// ---------------------------------------------------------------------------
// Search result (from adapter)
// ---------------------------------------------------------------------------

export type CanonicalSearchResult =
  | { ok: true; itineraries: CanonicalItinerary[]; searchId: string }
  | { ok: false; error: string; code: string }
