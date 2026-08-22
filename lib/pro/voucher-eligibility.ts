/**
 * Éligibilité voucher hôtel — extrait de
 * `app/api/pro/reservations/[id]/voucher/route.ts` pour être testable
 * (les fichiers `route.ts` de l'App Router ne doivent exporter que les
 * handlers HTTP reconnus, voir convention déjà en place sur les autres
 * routes de ce repo).
 *
 * Un voucher atteste qu'un séjour est réellement confirmé auprès du
 * fournisseur (et payé — le wallet n'est débité qu'après confirmation
 * réussie, voir `lib/booking/actions.ts::createReservationFromDraft`).
 * Sans ce filtre, une réservation encore `pending`/`on_request` ou déjà
 * `cancelled`/`refunded` produisait un PDF identique à celui d'une
 * réservation réellement confirmée — trouvé en audit Phase 11.
 */

export interface VoucherEligibilityInput {
  module: string
  status: string
  hotelName: string | null | undefined
  checkIn: string | null | undefined
  checkOut: string | null | undefined
}

/** Statuts pour lesquels un voucher hôtel peut être régénéré à la demande. */
const VOUCHER_ELIGIBLE_STATUSES = new Set(["confirmed", "completed"])

export function isVoucherEligible(
  row: VoucherEligibilityInput,
): row is VoucherEligibilityInput & { hotelName: string; checkIn: string; checkOut: string } {
  if (row.module !== "hotel") return false
  if (!row.hotelName || !row.checkIn || !row.checkOut) return false
  return VOUCHER_ELIGIBLE_STATUSES.has(row.status)
}

/**
 * Éligibilité voucher Omra — même règle que `isVoucherEligible` ci-dessus
 * (Phase 11 : `confirmed`/`completed` uniquement, jamais `pending` ni
 * `cancelled`/`refunded`), fonction dédiée plutôt qu'une extension de
 * `isVoucherEligible` pour ne jamais toucher au garde déjà audité et validé
 * en Phase 11 (RÈGLE ABSOLUE Phase 12 : ne pas réécrire un correctif déjà
 * validé).
 */
export interface OmraVoucherEligibilityInput {
  module: string
  status: string
  packageName: string | null | undefined
  departureDate: string | null | undefined
  returnDate: string | null | undefined
}

export function isOmraVoucherEligible(
  row: OmraVoucherEligibilityInput,
): row is OmraVoucherEligibilityInput & { packageName: string; departureDate: string; returnDate: string } {
  if (row.module !== "omra") return false
  if (!row.packageName || !row.departureDate || !row.returnDate) return false
  return VOUCHER_ELIGIBLE_STATUSES.has(row.status)
}

/** Éligibilité voucher Voyage Organisé (Package) — même règle, fonction dédiée. */
export interface PackageVoucherEligibilityInput {
  module: string
  status: string
  packageName: string | null | undefined
  departureDate: string | null | undefined
  returnDate: string | null | undefined
}

export function isPackageVoucherEligible(
  row: PackageVoucherEligibilityInput,
): row is PackageVoucherEligibilityInput & { packageName: string; departureDate: string; returnDate: string } {
  if (row.module !== "package") return false
  if (!row.packageName || !row.departureDate || !row.returnDate) return false
  return VOUCHER_ELIGIBLE_STATUSES.has(row.status)
}

/** Éligibilité voucher Attraction (Phase 13.1) — même règle, fonction dédiée. */
export interface ActivityVoucherEligibilityInput {
  module: string
  status: string
  activityName: string | null | undefined
  sessionDate: string | null | undefined
}

export function isActivityVoucherEligible(
  row: ActivityVoucherEligibilityInput,
): row is ActivityVoucherEligibilityInput & { activityName: string; sessionDate: string } {
  if (row.module !== "activity") return false
  if (!row.activityName || !row.sessionDate) return false
  return VOUCHER_ELIGIBLE_STATUSES.has(row.status)
}
