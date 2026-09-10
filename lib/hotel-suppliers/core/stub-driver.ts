/**
 * Fabrique un driver honnêtement NOT_CONFIGURED / DOCUMENTATION_REQUIRED —
 * utilisée pour tout fournisseur dont la documentation officielle n'a pas
 * pu être obtenue (Tunisia Bed, Cyberesa) ou n'a pas pu être atteinte
 * depuis cet environnement (3T — accès réseau bloqué vers
 * documenter.getpostman.com). Implémente HotelSupplierDriver pour rester
 * enregistrable dans le Hub et visible dans l'observabilité (status,
 * dernière erreur), sans jamais prétendre fonctionner : chaque méthode
 * renvoie explicitement NOT_CONFIGURED, jamais un résultat fabriqué.
 */
import type { HotelSupplierDriver, SupplierSearchResult, SupplierHotelDetails } from "./supplier"
import type {
  HotelSearchRequest,
  HotelDetailsRequest,
  CheckRateRequest,
  CheckRateResult,
  SupplierBookingRequest,
  SupplierBookingResult,
  SupplierBookingLookup,
  SupplierBooking,
  SupplierBookingReconciliationResult,
  SupplierCancellationRequest,
  SupplierCancellationResult,
  SupplierName,
} from "./types"
import { SupplierNotConfiguredError } from "./errors"

export function createDocumentationRequiredDriver(
  supplier: SupplierName,
  reason: string,
): HotelSupplierDriver {
  const notConfigured = () => new SupplierNotConfiguredError(supplier, reason)

  return {
    supplier,
    getConfigStatus(): "CONFIGURED" | "NOT_CONFIGURED" {
      return "NOT_CONFIGURED"
    },
    search(_request: HotelSearchRequest): Promise<SupplierSearchResult> {
      return Promise.reject(notConfigured())
    },
    getDetails(_request: HotelDetailsRequest): Promise<SupplierHotelDetails> {
      return Promise.reject(notConfigured())
    },
    checkRate(_request: CheckRateRequest): Promise<CheckRateResult> {
      return Promise.resolve({ ok: false, code: "NOT_CONFIGURED", message: reason })
    },
    book(_request: SupplierBookingRequest): Promise<SupplierBookingResult> {
      return Promise.resolve({ outcome: "DEFINITIVE_FAILURE", code: "NOT_CONFIGURED", message: reason })
    },
    getBooking(request: SupplierBookingLookup): Promise<SupplierBooking> {
      return Promise.resolve({ supplierBookingReference: request.supplierBookingReference, state: "UNKNOWN" })
    },
    cancel(_request: SupplierCancellationRequest): Promise<SupplierCancellationResult> {
      return Promise.resolve({ ok: false, code: "NOT_CONFIGURED", message: reason })
    },
    // Pas de paramètre déclaré (au lieu de `_request: SupplierBookingReconciliationRequest`,
    // le style des autres méthodes ci-dessus) — TypeScript accepte qu'une
    // méthode ignore des arguments de l'interface qu'elle implémente ; ça
    // évite un nouvel avertissement lint "unused var" pour ce seul ajout
    // Phase 27.2, sans toucher au style pré-existant des méthodes voisines.
    reconcileBooking(): Promise<SupplierBookingReconciliationResult> {
      return Promise.resolve({ outcome: "UNSUPPORTED" })
    },
  }
}
