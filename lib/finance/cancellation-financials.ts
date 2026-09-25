/**
 * Enregistrement des données financières d'annulation dans
 * `reservation_financials` — UPDATE de la ligne créée à la réservation.
 *
 * Chantier 39 : sans ceci, `reservation_financials` n'est jamais mis à jour
 * lors d'une annulation — le Dashboard Marges continuait d'afficher la marge
 * brute même pour les réservations annulées, et il était impossible de
 * calculer les frais d'annulation nets ou les remboursements effectifs.
 *
 * Appelée DANS la même transaction que `cancelHotelReservation` (B2B) et
 * `cancelMyHotelReservation` (B2C), exactement comme `recordReservationFinancials`
 * est appelée dans la transaction de création.
 *
 * Si la ligne `reservation_financials` est absente (réservation très ancienne,
 * créée avant le chantier 37A), on l'ignore silencieusement — l'annulation
 * continue. La règle "NEVER DELETE FINANCIAL TRANSACTIONS" est respectée :
 * on ne supprime rien, on enrichit la ligne existante.
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { reservationFinancials } from "@/lib/db/schema"

export interface RecordCancellationFinancialsInput {
  tx: DrizzleTransaction
  reservationId: string
  /** Frais retenus par le fournisseur myGo (TND). 0 = annulation gratuite. */
  cancellationFeeTnd: number
  /** Montant effectivement recrédité au wallet = tnd_amount - cancellationFeeTnd. */
  refundAmountTnd: number
  /** Motif d'annulation — "Annulation client", "Annulation partenaire", etc. */
  reason?: string
  /** Timestamp de l'annulation (défaut : maintenant). */
  cancelledAt?: Date
}

export async function recordCancellationFinancials(
  input: RecordCancellationFinancialsInput,
): Promise<void> {
  const { tx, reservationId, cancellationFeeTnd, refundAmountTnd, reason } = input
  const cancelledAt = input.cancelledAt ?? new Date()

  await tx
    .update(reservationFinancials)
    .set({
      cancellationFee: cancellationFeeTnd.toFixed(2),
      refundAmount: refundAmountTnd.toFixed(2),
      cancelledAt,
      ...(reason ? { cancellationReason: reason } : {}),
      updatedAt: cancelledAt,
    })
    .where(eq(reservationFinancials.reservationId, reservationId))
  // UPDATE ne retourne rien d'utile en Drizzle (rowCount non exposé) —
  // on tolère silencieusement le cas où la ligne est absente (réservation
  // créée avant 37A), plutôt que de bloquer l'annulation.
}
