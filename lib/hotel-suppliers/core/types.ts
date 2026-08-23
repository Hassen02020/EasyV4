/**
 * Contrat universel du Hub Fournisseurs Hôtels — provider-neutre.
 *
 * Booking Core (lib/booking/**, lib/finance/**) ne doit jamais dépendre de
 * ces types côté "raw supplier" — seulement des types normalisés définis
 * ici. Chaque driver traduit entre ce contrat et le format réel de son
 * fournisseur (XML MyGo, JSON/XML Tunisia Bed/Cyberesa/3T…) — voir
 * lib/hotel-suppliers/<supplier>/mapper.ts.
 */

export const SUPPLIER_NAMES = ["mygo", "tunisia-bed", "cyberesa", "3t"] as const
export type SupplierName = (typeof SUPPLIER_NAMES)[number]

export type SupplierRunStatus = "SUCCESS" | "TIMEOUT" | "ERROR" | "NOT_CONFIGURED"

export interface HotelSearchRequest {
  destinationId: string
  latitude?: number
  longitude?: number
  checkIn: string // YYYY-MM-DD
  checkOut: string // YYYY-MM-DD
  rooms: { adults: number; childAges?: number[] }[]
  nationality?: string
  currency: string
  language?: string
}

export interface HotelDetailsRequest {
  hotelId: string
  supplier: SupplierName
  supplierHotelCode: string
  language?: string
}

export interface CheckRateRequest {
  supplier: SupplierName
  supplierHotelCode: string
  supplierRateCode: string
  roomId: string
  /**
   * Blob opaque appartenant exclusivement au driver d'origine (ex. myGo
   * encode ici {cityId,hotelId,boardingId,roomId,token} en JSON) — le Hub
   * et Booking Core le transportent tel quel sans jamais l'interpréter,
   * exactement comme le `token` HotelSearch de myGo lui-même.
   */
  supplierToken?: string
  checkIn: string
  checkOut: string
  rooms: { adults: number; childAges?: number[] }[]
  currency: string
}

export interface SupplierBookingRequest {
  supplier: SupplierName
  supplierHotelCode: string
  supplierRateCode: string
  roomId: string
  supplierToken?: string
  checkIn: string
  checkOut: string
  currency: string
  /** Prix serveur-autoritaire déjà validé par CheckRate — jamais un prix client. */
  expectedNetPrice: number
  travelers: {
    civility?: string
    firstName: string
    lastName: string
    isHolder?: boolean
    age?: number
  }[]
  /** Idempotence côté driver — un même correlationId ne doit jamais créer 2 réservations fournisseur. */
  correlationId: string
  /** Dry-run — vérifie sans engager, quand le fournisseur le supporte. */
  preBooking?: boolean
}

export interface SupplierBookingLookup {
  supplier: SupplierName
  supplierBookingReference: string
}

export interface SupplierCancellationRequest {
  supplier: SupplierName
  supplierBookingReference: string
  /** true = simulation (frais calculés sans annuler réellement), quand supporté. */
  dryRun?: boolean
}

// ---------------------------------------------------------------------------
// Résultats normalisés
// ---------------------------------------------------------------------------

export interface NormalizedHotel {
  /** Identité Easy2Book (hotel_master) si déjà mappé — sinon absent tant que non résolu. */
  id?: string
  name: string
  address?: string
  city?: string
  country?: string
  latitude?: number
  longitude?: number
  stars?: number
  images: string[]
  facilities: string[]
  /** Toutes les correspondances fournisseur connues pour cet hôtel — jamais fusionnées silencieusement. */
  supplierMappings: { supplier: SupplierName; supplierHotelCode: string }[]
}

export type CancellationPolicyType =
  | "FREE_CANCELLATION"
  | "NON_REFUNDABLE"
  | "PARTIAL_PENALTY"
  | "FULL_PENALTY"
  | "UNKNOWN"

export interface NormalizedCancellationPolicy {
  type: CancellationPolicyType
  deadline?: string
  penaltyAmount?: number
  penaltyCurrency?: string
}

export interface NormalizedRate {
  hotelId: string
  supplier: SupplierName
  supplierHotelCode: string
  supplierRateCode: string
  roomId: string
  roomName: string
  board?: string
  occupancy: { adults: number; childAges?: number[] }
  currency: string
  /** Prix net fournisseur — jamais montré au client, jamais autoritaire pour la facturation finale seul. */
  netPrice: number
  /** Prix affiché après marge Easy2Book (lib/finance/margin-calculator.ts, inchangé). */
  sellingPrice: number
  cancellationPolicy: NormalizedCancellationPolicy
  refundable: boolean
  availability: number | "AVAILABLE" | "ON_REQUEST"
  /** Jeton fournisseur à rejouer tel quel lors de CheckRate/Book — jamais interprété par le Hub. */
  supplierToken?: string
}

export interface SupplierSearchOutcome {
  supplier: SupplierName
  status: SupplierRunStatus
  elapsedMs: number
  errorCode?: string
  errorMessage?: string
  hotels: NormalizedHotel[]
  rates: NormalizedRate[]
}

export interface HubSearchResult {
  correlationId: string
  results: NormalizedHotel[]
  rates: NormalizedRate[]
  supplierStatus: Record<SupplierName, SupplierRunStatus>
  elapsedMs: number
  failedSuppliers: SupplierName[]
}

export type CheckRateResult =
  | {
      ok: true
      rate: NormalizedRate
      priceChanged: boolean
    }
  | {
      ok: false
      code: "RATE_CHANGED" | "NO_AVAILABILITY" | "SUPPLIER_ERROR" | "NOT_CONFIGURED"
      message: string
      /** Présent uniquement pour RATE_CHANGED — le nouveau prix fournisseur autoritaire. */
      newRate?: NormalizedRate
    }

export type SupplierBookingResult =
  | {
      ok: true
      supplierBookingReference: string
      confirmedNetPrice: number
      currency: string
      state: "CONFIRMED" | "ON_REQUEST"
    }
  | {
      ok: false
      code:
        | "RATE_CHANGED"
        | "NO_AVAILABILITY"
        | "AMBIGUOUS_SUPPLIER_STATE"
        | "SUPPLIER_ERROR"
        | "AUTH_ERROR"
        | "TIMEOUT"
        | "NOT_CONFIGURED"
      message: string
    }

export interface SupplierBooking {
  supplierBookingReference: string
  state: "CONFIRMED" | "ON_REQUEST" | "CANCELLED" | "UNKNOWN"
  hotelId?: string
  checkIn?: string
  checkOut?: string
  currency?: string
  amount?: number
}

export type SupplierCancellationResult =
  | {
      ok: true
      supplierBookingReference: string
      state: "CANCELLED"
      penaltyAmount?: number
      penaltyCurrency?: string
    }
  | {
      ok: false
      code: "SUPPLIER_ERROR" | "AUTH_ERROR" | "TIMEOUT" | "NOT_CONFIGURED" | "NOT_FOUND"
      message: string
    }
