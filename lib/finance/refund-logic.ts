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
 * une réservation jamais payée (aucune ligne `payments` capturée) n'a
 * simplement rien à rembourser — l'appelant doit traiter ce cas comme un
 * no-op, pas un échec.
 *
 * B2B (crédit agence, `lib/pro/booking-actions.ts::debitPartnerCredit`) :
 * une ligne `payments` (method "wallet") EST créée en miroir du débit
 * `partner_credit_movements` (voir `lib/booking/actions.ts`), donc CE cas a
 * bien un montant "remboursable" au sens de cette fonction — mais le crédit
 * doit revenir au crédit agence, pas au wallet client. Voir
 * `wasFundedByAgencyCredit` ci-dessous.
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { agencies, auditEvents, partnerCreditMovements, payments } from "@/lib/db/schema"
import { creditCustomerWallet } from "./customer-wallet"
import { TND_EPSILON } from "./payment-summary"
import { allocateRefund } from "./refund-allocation"

/**
 * Détecte si CETTE réservation a été financée par le crédit agence B2B
 * (`debitPartnerCredit`, appelé depuis `lib/booking/actions.ts` pour le
 * tunnel Pro) plutôt que par un paiement B2C classique (carte/espèces/
 * virement/wallet client). Seul signal fiable : un mouvement
 * `partner_credit_movements` de type `debit` lié à `reservationId` — posé
 * UNE SEULE FOIS par réservation (idempotence `booking-debit:${reservationId}`
 * côté débit). Trouvé en E2E production-readiness : sans cette détection,
 * `applyReservationRefund` créditait TOUJOURS le wallet client
 * (`wallet_accounts`/`wallet_ledger`, table B2C — voir customer-wallet.ts),
 * y compris pour une réservation B2B — l'agence perdait alors réellement le
 * montant débité à la réservation, jamais restitué à son crédit propre.
 */
async function wasFundedByAgencyCredit(
  tx: DrizzleTransaction,
  reservationId: string,
): Promise<boolean> {
  const [debitMovement] = await tx
    .select({ id: partnerCreditMovements.id })
    .from(partnerCreditMovements)
    .where(
      and(
        eq(partnerCreditMovements.reservationId, reservationId),
        eq(partnerCreditMovements.movementType, "debit"),
      ),
    )
    .limit(1)
  return Boolean(debitMovement)
}

/**
 * Restitue un remboursement au crédit de dépôt de l'agence (B2B) —
 * symétrique de `debitPartnerCredit` (lib/pro/booking-actions.ts) et même
 * mécanique que l'annulation self-service Pro
 * (lib/booking/cancel-actions.ts::cancelHotelReservation), dupliquée ici
 * plutôt que partagée : ce fichier n'a pas de dépendance vers le flux Pro
 * self-service, et l'un et l'autre restent des points d'entrée distincts
 * (staff/admin ici, partenaire lui-même là-bas) sur le MÊME solde et le
 * MÊME ledger — jamais un second système de comptes.
 *
 * `set_agency_deposit_balance()` reste le SEUL canal autorisé pour écrire
 * `agencies.deposit_balance` : la table n'a pas de policy RLS UPDATE pour
 * une session tenant normale (uniquement `is_super_admin()`), un
 * `tx.update(agencies)` direct serait silencieusement filtré — voir le
 * commentaire détaillé dans `lib/pro/booking-actions.ts::debitPartnerCredit`.
 * `movementType: "refund"` — déjà dans l'enum `credit_movement_type`
 * ("remboursement (+)"), jamais une nouvelle valeur inventée.
 */
async function creditAgencyForRefund(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    reservationId: string
    publicRef: string
    amountTnd: number
    reason: string
    actorUserId: string
  },
): Promise<void> {
  const [agency] = await tx
    .select({ depositBalance: agencies.depositBalance })
    .from(agencies)
    .where(eq(agencies.id, params.agencyId))
    .for("update")

  if (!agency) {
    throw new Error(`Agence introuvable pour le remboursement (agencyId=${params.agencyId})`)
  }

  const currentBalance = Number.parseFloat(agency.depositBalance)
  const newBalance = currentBalance + params.amountTnd

  await tx.execute(
    sql`SELECT set_agency_deposit_balance(${params.agencyId}::uuid, ${newBalance.toFixed(3)}::numeric)`,
  )

  await tx.insert(partnerCreditMovements).values({
    agencyId: params.agencyId,
    movementType: "refund",
    amount: params.amountTnd.toFixed(3),
    balanceAfter: newBalance.toFixed(3),
    reference: `REFUND-${params.publicRef}`,
    description: `Remboursement réservation ${params.publicRef} — ${params.reason}`,
    reservationId: params.reservationId,
    createdByUserId: params.actorUserId,
  })
}

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

  // Restitue au MÊME solde qui a été débité à la réservation — jamais un
  // crédit wallet client pour une réservation financée par le crédit
  // agence B2B (voir wasFundedByAgencyCredit ci-dessus).
  if (await wasFundedByAgencyCredit(tx, reservationId)) {
    await creditAgencyForRefund(tx, {
      agencyId,
      reservationId,
      publicRef,
      amountTnd: requestedTnd,
      reason,
      actorUserId,
    })
  } else {
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
