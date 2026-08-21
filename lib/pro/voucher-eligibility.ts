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
