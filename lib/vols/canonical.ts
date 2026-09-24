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
  /** Marketing carrier IATA 2-letter code (e.g. "AF" for AF1234). */
  marketingCarrier: string
  /** Operating carrier IATA 2-letter code — differs on codeshares (e.g. "KL" flying AF metal). */
  operatingCarrier: string
  /** Marketing flight number (numeric part only, e.g. "1234"). */
  marketingFlightNumber: string
  /** Operating flight number — present when it differs from marketingFlightNumber. */
  operatingFlightNumber?: string
  durationMinutes: number
  stops: number           // 0 = direct
  equipment?: string      // aircraft type, e.g. "B737"
  cabin: CabinClass
  bookingClass?: string   // fare basis class letter
  fareBrandId?: string    // links to FareBrand in CanonicalItinerary.fareBrands
}

export type CabinClass = "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST"

// ---------------------------------------------------------------------------
// Layover (connection between two segments within a journey)
// ---------------------------------------------------------------------------

export interface Layover {
  /** IATA code of the connection airport. */
  airport: string
  durationMinutes: number
  isOvernightLayover: boolean
  terminalChange?: boolean
}

// ---------------------------------------------------------------------------
// Journey (one logical leg: outbound TUN→CDG, or return CDG→TUN)
// ---------------------------------------------------------------------------

export interface Journey {
  origin: string           // first segment's origin
  destination: string      // last segment's destination
  departureDate: string    // YYYY-MM-DD
  segments: CanonicalSegment[]
  /** Computed layovers between consecutive segments. Empty for direct flights. */
  layovers: Layover[]
}

// ---------------------------------------------------------------------------
// Fare Brand / Fare Family
// ---------------------------------------------------------------------------

export interface FareBrand {
  brandId: string
  name: string             // e.g. "Economy Light", "Economy Flex", "Business"
  cabinClass: CabinClass
  refundable: boolean
  changeable: boolean
  changePenaltyAmount?: number
  changePenaltyCurrency?: string
  includedBaggageKg?: number
  seatSelectionIncluded: boolean
  /** Upgrade to next cabin available at booking. */
  upgradeable?: boolean
  /** Human-readable conditions (from provider). */
  conditions?: string
}

// ---------------------------------------------------------------------------
// Fare (financial — amounts per passenger type)
// ---------------------------------------------------------------------------

export interface CanonicalFare {
  currency: string         // 3-letter ISO currency (supplier currency)
  baseAmount: number       // fare base, before taxes
  taxAmount: number
  totalAmount: number      // baseAmount + taxAmount, per-pax
  passengerType: "ADT" | "CHD" | "INF"
  count: number            // number of passengers at this fare
  /** Links to FareBrand.brandId when fare families are available. */
  fareBrandId?: string
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
// Ancillary services (upsell at booking)
// ---------------------------------------------------------------------------

export interface Ancillary {
  ancillaryId: string
  type: "BAGGAGE" | "SEAT" | "MEAL" | "LOUNGE" | "INSURANCE"
  description: string
  amount: number
  currency: string
  /** Segment sequence numbers this ancillary applies to. Null = all segments. */
  segmentRefs?: number[]
  /** Passenger sequence number. Null = all passengers. */
  passengerRef?: number
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
   * Ordered journeys (legs).
   * ONE_WAY   : one Journey (e.g. TUN→CDG)
   * ROUND_TRIP: two Journeys (outbound + return)
   * MULTI_CITY: N Journeys, one per requested city-pair
   *
   * Each Journey groups its segments and computed layovers.
   */
  journeys: Journey[]
  fares: CanonicalFare[]
  /** Fare brands available for this offer — present when provider supports NDC/branded fares. */
  fareBrands?: FareBrand[]
  baggage: CanonicalBaggage
  fareRules: CanonicalFareRules
  /** Optional ancillary services available for upsell. */
  ancillaries?: Ancillary[]
  provider: CanonicalProviderReference
  /** Total supplier price (all fares summed, all pax). */
  supplierTotalAmount: number
  supplierCurrency: string
  /** Number of available seats (null = unknown). */
  availableSeats: number | null
}

// ---------------------------------------------------------------------------
// Search request preferences
// ---------------------------------------------------------------------------

export interface SearchPreferences {
  /** 0 = direct flights only, 1 = max one stop, etc. */
  maxStops?: number
  preferredAirlines?: string[]    // IATA 2-letter codes
  excludedAirlines?: string[]
  /** Departure time window (local HH:MM). */
  departureTimeRange?: { from: string; to: string }
  /** Arrival time window (local HH:MM). */
  arrivalTimeRange?: { from: string; to: string }
  maxDurationMinutes?: number
  preferredAirports?: string[]    // IATA 3-letter codes
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
  /** Optional search preferences passed to GDS adapters where supported. */
  preferences?: SearchPreferences
}

// ---------------------------------------------------------------------------
// Search result (from adapter)
// ---------------------------------------------------------------------------

export type CanonicalSearchResult =
  | { ok: true; itineraries: CanonicalItinerary[]; searchId: string }
  | { ok: false; error: string; code: string }

// ---------------------------------------------------------------------------
// Utility: compute layovers from an ordered segment array
// ---------------------------------------------------------------------------

export function computeLayovers(segments: CanonicalSegment[]): Layover[] {
  const layovers: Layover[] = []
  for (let i = 0; i < segments.length - 1; i++) {
    const arrivalMs = new Date(segments[i].arrival).getTime()
    const departureMs = new Date(segments[i + 1].departure).getTime()
    const durationMinutes = Math.max(0, Math.round((departureMs - arrivalMs) / 60_000))
    const arrivalDate = new Date(segments[i].arrival)
    const nextDepartureDate = new Date(segments[i + 1].departure)
    const isOvernightLayover =
      nextDepartureDate.getUTCDate() !== arrivalDate.getUTCDate() ||
      nextDepartureDate.getUTCFullYear() !== arrivalDate.getUTCFullYear()
    layovers.push({
      airport: segments[i].destination,
      durationMinutes,
      isOvernightLayover,
    })
  }
  return layovers
}

// ---------------------------------------------------------------------------
// Utility: flatten all segments from all journeys
// ---------------------------------------------------------------------------

export function flattenSegments(itinerary: CanonicalItinerary): CanonicalSegment[] {
  return itinerary.journeys.flatMap((j) => j.segments)
}
