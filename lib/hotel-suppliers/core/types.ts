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

/**
 * PHASE 27.2 — discriminant explicite `outcome` (jamais un simple `ok`
 * booléen) : un timeout/erreur réseau sur BookingCreation laisse un état
 * réellement AMBIGU (myGo a peut-être créé la réservation avant que la
 * réponse ne se perde) — très différent d'un refus DÉFINITIF (prix/dispo
 * changés, credentials invalides...). Confondre les deux au niveau du
 * type système est exactement ce qui permettait auparavant un second BOOK
 * "en aveugle" après un échec ambigu. Le driver ne DEVINE jamais lequel :
 * il ne peut classifier que ce que l'erreur fournisseur lui indique
 * réellement (voir MyGoDriver.book(), qui réutilise
 * lib/booking/hotel-provider-booking.ts::classifyMyGoBookingError — la
 * même classification que Booking Core utilise déjà, jamais une seconde
 * heuristique divergente).
 */
export type SupplierBookingResult =
  | {
      outcome: "SUCCESS"
      supplierBookingReference: string
      confirmedNetPrice: number
      currency: string
      state: "CONFIRMED" | "ON_REQUEST"
      /** Optionnel — présent quand le driver peut le fournir, pour préserver les vérifications de cohérence existantes (ex. bookingConfirmationMatchesExpectedHotel). */
      hotelId?: string
    }
  | {
      /** Refus définitif — jamais réessayé en aveugle, mais un NOUVEAU CheckRate/BOOK explicite reste possible si l'utilisateur relance. */
      outcome: "DEFINITIVE_FAILURE"
      code: "RATE_CHANGED" | "NO_AVAILABILITY" | "SUPPLIER_ERROR" | "AUTH_ERROR" | "NOT_CONFIGURED"
      message: string
    }
  | {
      /** État incertain — le driver ne sait pas si la réservation a été créée. Ne JAMAIS relancer BOOK ; l'appelant doit passer par reconcileBooking(). */
      outcome: "AMBIGUOUS"
      code: "TIMEOUT" | "NETWORK_ERROR" | "MALFORMED_RESPONSE" | "UNKNOWN_ERROR"
      message: string
    }

/**
 * PHASE 27.2 — capacité de réconciliation minimale, provider-neutre. Un
 * driver qui ne peut pas offrir de réconciliation fiable renvoie
 * `UNSUPPORTED` (jamais un faux NOT_FOUND) — l'appelant garde alors l'état
 * ambigu tel quel plutôt que de perdre l'information.
 */
export interface SupplierBookingReconciliationRequest {
  supplier: SupplierName
  supplierHotelCode: string
  checkIn: string
  checkOut: string
  /** Fenêtre de récence (minutes) pour la recherche best-effort — le driver applique son propre défaut si omis. */
  windowMinutes?: number
}

export type SupplierBookingReconciliationResult =
  | {
      outcome: "FOUND"
      supplierBookingReference: string
      confirmedNetPrice: number
      currency: string
      state: "CONFIRMED" | "ON_REQUEST"
      hotelId?: string
    }
  | { outcome: "NOT_FOUND" }
  | { outcome: "STILL_AMBIGUOUS"; message: string }
  | { outcome: "UNSUPPORTED" }

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
