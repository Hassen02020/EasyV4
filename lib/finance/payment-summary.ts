/**
 * Résumé financier autoritatif d'une réservation — Phase 16.2 (Partial
 * Payment Ledger).
 *
 * Source de vérité UNIQUE pour TOTAL/COLLECTED/REMAINING/paymentState —
 * `reservations.depositPaid` n'est PAS utilisée (jamais tenue à jour en
 * pratique, voir l'audit Phase 16.1 : écrite "0" à la création, aucun
 * appelant réel de `ReservationRepository.updateDepositPaid`). `collected`
 * est toujours recalculé par somme réelle des lignes `payments`
 * capturées, nette de tout remboursement déjà appliqué sur cette même
 * ligne (`tndAmount - refundedAmount`) — reste correct après un
 * remboursement partiel, jamais une valeur mise en cache qui pourrait
 * diverger du grand livre réel.
 */

import { and, eq, inArray } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { payments, reservations } from "@/lib/db/schema"

export type PaymentState = "UNPAID" | "PARTIALLY_PAID" | "FULLY_PAID"

export interface ReservationPaymentSummary {
  reservationId: string
  totalTnd: number
  collectedTnd: number
  remainingTnd: number
  paymentState: PaymentState
}

/** Tolérance flottante pour les comparaisons TND (2 décimales) après plusieurs additions. */
export const TND_EPSILON = 0.005

export function computePaymentState(totalTnd: number, collectedTnd: number): PaymentState {
  if (collectedTnd <= TND_EPSILON) return "UNPAID"
  if (collectedTnd >= totalTnd - TND_EPSILON) return "FULLY_PAID"
  return "PARTIALLY_PAID"
}

/* -------------------------------------------------------------------------- */
/* Types injectables — mêmes principes que lib/finance/customer-wallet.ts :   */
/* testable sans DB réelle via un faux client Drizzle.                       */
/* -------------------------------------------------------------------------- */

export type DrizzleLikeTx = {
  select: (...args: unknown[]) => DrizzleLikeChain
}
export type DrizzleLikeChain = {
  from?: (...args: unknown[]) => DrizzleLikeChain
  where?: (...args: unknown[]) => Promise<unknown[]>
}

export interface GetReservationPaymentSummaryInput {
  reservationId: string
  /** Réutilise une transaction déjà ouverte (ex. `verifyManualPayment`, qui a
   * déjà verrouillé la ligne `reservations` — cohérent sans verrou
   * supplémentaire sur `payments`, puisque toute mutation de paiement pour
   * cette réservation passe elle-même par le même verrou `reservations`
   * avant d'écrire). Sans override, ouvre son propre contexte système
   * (lecture seule, hors session utilisateur). */
  txOverride?: DrizzleLikeTx
}

/** Calcule le résumé de paiement d'une réservation (total/collecté/restant/état). */
export async function getReservationPaymentSummary(
  input: GetReservationPaymentSummaryInput,
): Promise<ReservationPaymentSummary> {
  const { reservationId, txOverride } = input
  const run = async (tx: DrizzleLikeTx): Promise<ReservationPaymentSummary> => {
    const reservationRows = (await tx
      .select({ tndAmount: reservations.tndAmount })
      .from?.(reservations)
      .where?.(eq(reservations.id, reservationId))) as Array<{ tndAmount: string }>

    const reservation = reservationRows?.[0]
    if (!reservation) {
      throw new Error(`getReservationPaymentSummary: réservation "${reservationId}" introuvable.`)
    }
    const totalTnd = Number.parseFloat(reservation.tndAmount)

    const paymentRows = (await tx
      .select({ tndAmount: payments.tndAmount, refundedAmount: payments.refundedAmount })
      .from?.(payments)
      .where?.(
        and(
          eq(payments.reservationId, reservationId),
          inArray(payments.status, ["captured", "partial_refund", "refunded"]),
        ),
      )) as Array<{ tndAmount: string; refundedAmount: string }>

    const collectedTnd = (paymentRows ?? []).reduce(
      (sum, row) => sum + (Number.parseFloat(row.tndAmount) - Number.parseFloat(row.refundedAmount)),
      0,
    )
    const remainingTnd = Math.max(totalTnd - collectedTnd, 0)

    return {
      reservationId,
      totalTnd,
      collectedTnd,
      remainingTnd,
      paymentState: computePaymentState(totalTnd, collectedTnd),
    }
  }

  if (txOverride) return run(txOverride)
  // Cast de la fonction (pas du callback) vers la signature simplifiée —
  // même idée que lib/finance/customer-wallet.ts::debitCustomerWallet, qui
  // caste `db` avant `.transaction(run)` pour la même raison : le vrai
  // type de transaction Drizzle est structurellement plus riche que
  // `DrizzleLikeTx` (utilisé pour rester testable sans DB réelle), donc
  // TypeScript refuse l'assignation directe même si elle est correcte à
  // l'exécution (`DrizzleLikeTx` n'utilise qu'un sous-ensemble de l'API réelle).
  return (
    withSystemContext as unknown as (
      fn: (tx: DrizzleLikeTx) => Promise<ReservationPaymentSummary>,
    ) => Promise<ReservationPaymentSummary>
  )(run)
}
