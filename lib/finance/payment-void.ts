/**
 * T-1 (CANCEL-POLICY-DISPLAY-01) — une réservation annulée ne doit plus
 * laisser de règlement « en attente » : sans ce garde-fou, un client ayant
 * reçu les coordonnées de virement pouvait encore payer une réservation
 * déjà annulée (constaté en production le 2026-11-07 sur TG-2026-000004).
 *
 * À appeler DANS la transaction qui passe la réservation à `cancelled`.
 * Ne touche QUE les lignes `payments` encore `pending` (jamais encaissées) :
 *  - aucun mouvement d'argent, aucune écriture `wallet_ledger`, aucun droit
 *    économique, aucun règlement (périmètre explicitement exclu) ;
 *  - une ligne `captured` n'est jamais modifiée (le remboursement reste
 *    l'affaire de applyReservationRefund, inchangé).
 * Statut cible `failed` : même valeur que le précédent existant
 * (app/api/cron/expire-pending-payments, paiements carte des réservations
 * expirées) — l'énumération `payment_status` n'a pas de valeur « annulé »,
 * en ajouter une exigerait une migration séparée.
 * Idempotent : un second appel ne trouve plus de ligne `pending`.
 */
import { and, eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { auditEvents, payments } from "@/lib/db/schema"

export async function voidPendingPaymentsOnCancellation(
  tx: DrizzleTransaction,
  input: {
    reservationId: string
    actorUserId: string | null
    reason: string
  },
): Promise<number> {
  const voided = await tx
    .update(payments)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(payments.reservationId, input.reservationId),
        eq(payments.status, "pending"),
      ),
    )
    .returning({
      id: payments.id,
      agencyId: payments.agencyId,
      method: payments.method,
      tndAmount: payments.tndAmount,
    })
  for (const p of voided) {
    await tx.insert(auditEvents).values({
      agencyId: p.agencyId,
      actorUserId: input.actorUserId,
      entityType: "payment",
      entityId: p.id,
      action: "payment.voided",
      diff: {
        reservationId: input.reservationId,
        method: p.method,
        amount: p.tndAmount,
        from: "pending",
        to: "failed",
        reason: input.reason,
      },
    })
  }
  return voided.length
}
