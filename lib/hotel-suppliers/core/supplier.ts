import type {
  HotelSearchRequest,
  HotelDetailsRequest,
  CheckRateRequest,
  CheckRateResult,
  SupplierBookingRequest,
  SupplierBookingResult,
  SupplierBookingLookup,
  SupplierBooking,
  SupplierCancellationRequest,
  SupplierCancellationResult,
  NormalizedHotel,
  NormalizedRate,
  SupplierName,
  SupplierRunStatus,
} from "./types"

export interface SupplierSearchResult {
  hotels: NormalizedHotel[]
  rates: NormalizedRate[]
}

export interface SupplierHotelDetails {
  hotel: NormalizedHotel
}

/**
 * Interface commune à tous les drivers fournisseurs. Chaque driver possède
 * son propre client/mapper/sérialiseur — jamais de structure spécifique
 * (XML MyGo, JSON Cyberesa…) exposée au-delà de cette interface.
 */
export interface HotelSupplierDriver {
  readonly supplier: SupplierName

  /** SUCCESS implique des credentials configurés et un endpoint atteignable — jamais déduit, toujours vérifié par le driver. */
  getConfigStatus(): "CONFIGURED" | "NOT_CONFIGURED"

  search(request: HotelSearchRequest): Promise<SupplierSearchResult>
  getDetails(request: HotelDetailsRequest): Promise<SupplierHotelDetails>
  checkRate(request: CheckRateRequest): Promise<CheckRateResult>
  book(request: SupplierBookingRequest): Promise<SupplierBookingResult>
  getBooking(request: SupplierBookingLookup): Promise<SupplierBooking>
  cancel(request: SupplierCancellationRequest): Promise<SupplierCancellationResult>
}

export type { SupplierName, SupplierRunStatus }
