/**
 * Rôles autorisés à effectuer un remboursement — extrait de
 * `refund-actions.ts` (fichier "use server", qui ne peut exporter QUE des
 * fonctions async — voir la convention Next.js) pour rester importable
 * depuis un composant UI (gate d'affichage du bouton Rembourser) sans
 * déclencher d'erreur de build. Même motif que
 * `lib/finance/manual-payment-logic.ts::MANUAL_PAYMENT_ALLOWED_ROLES`.
 */
export const REFUND_ALLOWED_ROLES = ["super_admin", "manager", "agent_compta"] as const

/**
 * Application (mutation DB) d'un remboursement — extraite de
 * `refund-actions.ts::refundReservation` (Phase 16.2) pour être réutilisée
 * par `lib/admin/actions.ts::updateReservationStatus` (Phase 18) : annuler
 * une réservation B2C qui a des paiements CAPTURÉS doit rembourser ces
 * paiements dans la MÊME transaction que le changement de statut — sinon
 * une annulation admin laisse l'argent capturé indéfiniment, jamais rendu
 * au client (défaut d'intégrité paiement/ledger que la Phase 18 demande
 * explicitement de corriger).
 *
 * Ne touche PAS `reservations.status` — l'appelant décide (refundReservation
 * le passe à `refunded` seulement si intégralement remboursé ;
 * updateReservationStatus le passe déjà à `cancelled` séparément).
 * `NO_CAPTURED_PAYMENT` n'est pas une erreur pour un appelant "annulation" :
 * une réservation B2B (financée par le crédit agence, jamais par
 * `payments`) ou une réservation B2C jamais payée n'a simplement rien à
 * rembourser — l'appelant doit traiter ce cas comme un no-op, pas un échec.
 */

import { and, asc, eq, inArray } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { auditEvents, payments } from "@/lib/db/schema"
import { creditCustomerWallet } from "./customer-wallet"
import { TND_EPSILON } from "./payment-summary"
import { allocateRefund } from "./refund-allocation"

export interface ApplyReservationRefundInput {
  tx: DrizzleTransaction
  agencyId: string
  reservationId: string
  customerId: string
  publicRef: string
  reason: string
  actorUserId: string
  /** Omis = remboursement total du montant encore remboursable. */
  amountTnd?: number
  /**
   * Appelé UNIQUEMENT si l'allocation s'avère être un remboursement total —
   * AVANT toute mutation (payments/wallet/audit) — pour laisser l'appelant
   * refuser (ex. transition de statut réservation interdite) sans jamais
   * capturer un remboursement partiel. Omis = pas de vérification :
   * l'appelant ne fait lui-même aucune transition vers `refunded` (ex.
   * l'annulation, qui met déjà `cancelled` séparément et n'a donc rien à
   * valider ici).
   */
  checkFullRefundAllowed?: () => { ok: true } | { ok: false; error: string }
}

export type ApplyReservationRefundResult =
  | { ok: true; refundedTnd: number; fullyRefunded: boolean }
  | { ok: false; code: "NO_CAPTURED_PAYMENT" | "AMOUNT_EXCEEDS_CAPTURED" | "NOT_REFUNDABLE"; error: string }

export async function applyReservationRefund(
  input: ApplyReservationRefundInput,
): Promise<ApplyReservationRefundResult> {
  const { tx, agencyId, reservationId, customerId, publicRef, reason, actorUserId, amountTnd, checkFullRefundAllowed } = input

  const refundableRows = await tx
    .select({ id: payments.id, tndAmount: payments.tndAmount, refundedAmount: payments.refundedAmount })
    .from(payments)
    .where(
      and(
        eq(payments.reservationId, reservationId),
        eq(payments.agencyId, agencyId),
        inArray(payments.status, ["captured", "partial_refund"]),
      ),
    )
    .orderBy(asc(payments.capturedAt))
    .for("update")

  const allocation = allocateRefund(refundableRows, amountTnd, TND_EPSILON)
  if (!allocation.ok) {
    return { ok: false, code: allocation.code, error: allocation.error }
  }
  const { requestedTnd, fullyRefunded, updates } = allocation

  if (fullyRefunded && checkFullRefundAllowed) {
    const check = checkFullRefundAllowed()
    if (!check.ok) {
      return { ok: false, code: "NOT_REFUNDABLE", error: check.error }
    }
  }

  for (const update of updates) {
    await tx
      .update(payments)
      .set({
        refundedAmount: update.newRefundedAmount.toFixed(2),
        status: update.newStatus,
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, update.id))
  }

  const credit = await creditCustomerWallet({
    customerId,
    amountTnd: requestedTnd,
    reservationId,
    description: `Remboursement réservation ${publicRef} — ${reason}`,
    source: "refund",
    txOverride: tx as Parameters<typeof creditCustomerWallet>[0]["txOverride"],
  })
  if (!credit.ok) {
    throw new Error(`Échec du crédit wallet client : ${credit.message}`)
  }

  await tx.insert(auditEvents).values({
    agencyId,
    actorUserId,
    entityType: "reservation",
    entityId: reservationId,
    action: "payment.refunded",
    diff: { publicRef, amountTnd: requestedTnd.toFixed(2), fullyRefunded, reason },
  })

  return { ok: true, refundedTnd: requestedTnd, fullyRefunded }
}
