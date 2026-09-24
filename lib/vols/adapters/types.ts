/**
 * GdsAdapter — the only interface the Flight Core interacts with.
 * Every provider implements this; nothing GDS-specific leaks upward.
 */

import type {
  CanonicalSearchRequest,
  CanonicalSearchResult,
  CanonicalItinerary,
} from "../canonical"

// ---------------------------------------------------------------------------
// Recheck result
// ---------------------------------------------------------------------------

export type RecheckStatus =
  | "AVAILABLE"
  | "PRICE_CHANGED"
  | "UNAVAILABLE"
  | "EXPIRED"
  | "ERROR"

export interface RecheckResult {
  status: RecheckStatus
  /** Current supplier price (all pax). Present when status is AVAILABLE or PRICE_CHANGED. */
  currentSupplierAmount?: number
  currentSupplierCurrency?: string
  /** Updated itinerary from provider (may carry new pricingToken for booking). */
  itinerary?: CanonicalItinerary
  error?: string
}

// ---------------------------------------------------------------------------
// Booking result
// ---------------------------------------------------------------------------

export interface BookResult {
  pnr: string
  /** Provider booking reference (differs from PNR at some GDS). */
  supplierBookingReference: string
  /** Any provider-side transaction or order ID. */
  transactionId?: string
}

// ---------------------------------------------------------------------------
// Ticket result
// ---------------------------------------------------------------------------

export interface IssueResult {
  tickets: Array<{
    passengerRef: string   // matches passenger index or id
    ticketNumber: string   // IATA e-ticket format: 3-digit airline code + 10 digits
    eticketUrl?: string
  }>
}

// ---------------------------------------------------------------------------
// GdsAdapter interface
// ---------------------------------------------------------------------------

export interface GdsAdapter {
  /** Unique adapter identifier, used in CanonicalProviderReference.provider. */
  readonly name: string

  /** Returns CONFIGURED when env vars for this adapter are present and valid. */
  getConfigStatus(): "CONFIGURED" | "NOT_CONFIGURED"

  /** Search for itineraries. Rejects on hard failure. */
  search(request: CanonicalSearchRequest): Promise<CanonicalSearchResult>

  /**
   * Recheck price + availability for a previously seen itinerary.
   * Called before any booking action.
   */
  recheck(itinerary: CanonicalItinerary): Promise<RecheckResult>

  /**
   * Create a booking (PNR) for an itinerary. Passengers and contact are
   * passed as raw JSON blobs to avoid coupling the interface to a specific
   * passenger schema — adapters validate internally.
   */
  book(
    itinerary: CanonicalItinerary,
    passengers: unknown[],
    contact: unknown,
  ): Promise<BookResult>

  /** Issue tickets (e-tickets) for a booked PNR. */
  issue(pnr: string, itinerary: CanonicalItinerary): Promise<IssueResult>

  /** Cancel / void a booking. */
  cancel(pnr: string, itinerary: CanonicalItinerary): Promise<void>
}
