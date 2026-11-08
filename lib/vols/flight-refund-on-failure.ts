"use server"

/**
 * FLIGHT-REFUND-GAP-01 — Remboursement automatique sur échec GDS.
 *
 * Appelé après chaque updateFlightStatus("FAILED") dans fulfillment-action.ts.
 * Si un paiement capturé existe → crédite le wallet client via applyReservationRefund.
 * NO_CAPTURED_PAYMENT est un no-op silencieux (paiement non encore capturé ou B2B).
 * Ne propage jamais d'exception : un échec est loggé, jamais fatal au flux appelant.
 */

import { compensateEntitlementsOnCancellation } from "@/lib/finance/entitlement-compensation"
import { eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations } from "@/lib/db/schema"
import { applyReservationRefund } from "@/lib/finance/refund-logic"
import { recordCancellationFinancials } from "@/lib/finance/cancellation-financials"
import { reverseCommissionOnCancellation } from "@/lib/finance/commission-reversal"

export async function autoRefundOnFlightFailure({
  reservationId,
  agencyId,
  actorUserId,
  reason,
}: {
  reservationId: string
  agencyId: string
  actorUserId: string | null
  reason: string
}): Promise<void> {
  try {
    await withSystemContext(async (tx) => {
      const rows = await tx
        .select({
          customerId: reservations.customerId,
          publicRef: reservations.publicRef,
        })
        .from(reservations)
        .where(eq(reservations.id, reservationId))
        .limit(1)

      const row = rows[0]
      if (!row) return

      const result = await applyReservationRefund({
        tx,
        agencyId,
        reservationId,
        customerId: row.customerId,
        publicRef: row.publicRef,
        reason,
        actorUserId,
      })

      if (result.ok || result.code === "NO_CAPTURED_PAYMENT") {
        const refundedTnd = result.ok ? result.refundedTnd : 0
        const cancelledAt = new Date()

        await recordCancellationFinancials({
          tx,
          reservationId,
          cancellationFeeTnd: 0,
          refundAmountTnd: refundedTnd,
          reason,
          cancelledAt,
        })

        await reverseCommissionOnCancellation(tx, {
          reservationId,
          publicRef: row.publicRef,
          actorUserId,
        })

        // CANCEL-FINANCIAL-COHERENCE-01 étape 2b : compensation des droits par
        // rôle (D-02a ; frais inconnus → trace « à traiter », D2b-1 = A).
        await compensateEntitlementsOnCancellation(tx, {
          reservationId,
          supplierFeeTnd: null,
          publicRef: row.publicRef,
          actorUserId,
          reason: "Remboursement vol après échec émission",
        })
      }

      if (!result.ok && result.code !== "NO_CAPTURED_PAYMENT") {
        console.error(
          JSON.stringify({
            tag: "FLIGHT_AUTO_REFUND_FAILURE",
            reservationId,
            code: result.code,
            error: result.error,
            ts: new Date().toISOString(),
          }),
        )
      }
    })
  } catch (err) {
    console.error(
      JSON.stringify({
        tag: "FLIGHT_AUTO_REFUND_EXCEPTION",
        reservationId,
        error: String(err),
        ts: new Date().toISOString(),
      }),
    )
  }
}
