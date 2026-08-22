/**
 * Allocation d'un remboursement (total ou partiel) sur les lignes
 * `payments` capturées d'une réservation — logique pure, extraite de
 * `refund-actions.ts` ("use server", même motif que
 * `lib/booking/guest-card-payment.ts`) pour rester testable sans DB.
 *
 * Une réservation peut désormais avoir plusieurs lignes `payments`
 * capturées (Wallet + virement + dépôt — Phase 16.2). Un remboursement
 * consomme ces lignes dans l'ORDRE FOURNI (l'appelant les trie par date de
 * capture), chacune gardant son propre `refundedAmount` honnête — jamais
 * un remboursement global déconnecté des lignes réelles.
 */

export interface RefundableRow {
  id: string
  tndAmount: string
  refundedAmount: string
}

export interface RefundRowUpdate {
  id: string
  newRefundedAmount: number
  newStatus: "refunded" | "partial_refund"
}

export type RefundAllocationResult =
  | {
      ok: true
      requestedTnd: number
      totalRefundableTnd: number
      fullyRefunded: boolean
      updates: RefundRowUpdate[]
    }
  | {
      ok: false
      code: "NO_CAPTURED_PAYMENT" | "AMOUNT_EXCEEDS_CAPTURED"
      error: string
    }

/**
 * Calcule l'allocation d'un remboursement — ne touche aucune DB, ne
 * garantit rien seule : l'appelant doit verrouiller (`FOR UPDATE`) les
 * lignes `refundableRows` avant d'appeler cette fonction, puis appliquer
 * `updates` dans la MÊME transaction.
 *
 * `amountTnd` omis = remboursement total du montant encore remboursable.
 */
export function allocateRefund(
  refundableRows: RefundableRow[],
  amountTnd: number | undefined,
  epsilon: number,
): RefundAllocationResult {
  const totalRefundableTnd = refundableRows.reduce(
    (sum, r) => sum + (Number.parseFloat(r.tndAmount) - Number.parseFloat(r.refundedAmount)),
    0,
  )

  if (refundableRows.length === 0 || totalRefundableTnd <= epsilon) {
    return {
      ok: false,
      code: "NO_CAPTURED_PAYMENT",
      error: "Aucun paiement capturé trouvé pour cette réservation — rien à rembourser.",
    }
  }

  const requestedTnd = amountTnd ?? totalRefundableTnd
  if (requestedTnd > totalRefundableTnd + epsilon) {
    return {
      ok: false,
      code: "AMOUNT_EXCEEDS_CAPTURED",
      error: `Montant demandé (${requestedTnd.toFixed(2)} DT) supérieur au montant remboursable (${totalRefundableTnd.toFixed(2)} DT).`,
    }
  }

  const fullyRefunded = requestedTnd >= totalRefundableTnd - epsilon

  const updates: RefundRowUpdate[] = []
  let remainingToApply = requestedTnd
  for (const row of refundableRows) {
    if (remainingToApply <= epsilon) break
    const rowTnd = Number.parseFloat(row.tndAmount)
    const rowAlreadyRefunded = Number.parseFloat(row.refundedAmount)
    const rowRefundable = rowTnd - rowAlreadyRefunded
    if (rowRefundable <= epsilon) continue

    const applied = Math.min(remainingToApply, rowRefundable)
    const newRefundedAmount = rowAlreadyRefunded + applied
    const rowFullyRefunded = newRefundedAmount >= rowTnd - epsilon

    updates.push({
      id: row.id,
      newRefundedAmount,
      newStatus: rowFullyRefunded ? "refunded" : "partial_refund",
    })
    remainingToApply -= applied
  }

  return { ok: true, requestedTnd, totalRefundableTnd, fullyRefunded, updates }
}
