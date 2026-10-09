/**
 * Cœur transactionnel du webhook PSP de recharge wallet agence (B2B) —
 * extrait de app/api/payment/webhook/route.ts (qui ne peut pas exporter
 * de fonction non-HTTP) pour rester testable en DB-mode sans requête HTTP
 * réelle. Même discipline que lib/payment/reservation-webhook-core.ts /
 * lib/reviews/reviews-core.ts / lib/favorites/favorites-core.ts.
 *
 * La route HTTP reste responsable UNIQUEMENT de : parsing du corps,
 * vérification de signature, construction de l'auditPayload, et envoi
 * de l'événement Inngest best-effort après un `credited`.
 *
 * Garanties de sécurité préservées :
 *  P0-A : corrélation walletRechargeRequest AVANT consommation de l'eventId —
 *         un no_match laisse l'eventId disponible pour un replay PSP.
 *  P0-B : vérification identité PSP (psp stocké sur la demande) AVANT
 *         consommation de l'eventId — un cross-PSP spoof ne consomme pas
 *         l'eventId et permet au PSP légitime d'envoyer le sien.
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  paymentEvents,
  pspWebhooks,
  walletRechargeRequests,
} from "@/lib/db/schema"
import {
  creditRechargeRequest,
  reverseRechargeCredit,
} from "@/lib/finance/wallet-credit"
import {
  classifyEventType,
  matchesPendingRecharge,
  type NormalizedChargeEvent,
} from "@/lib/payment/webhook-logic"

export type WalletWebhookOutcome =
  | { status: "ignored" }
  | { status: "no_match" }
  | { status: "duplicate" }
  | {
      status: "refunded"
      agencyId: string
      txId: string
      amount: number
      newBalance: number
    }
  | { status: "refund_ignored" }
  | { status: "already_processed" }
  | { status: "payment_failed"; agencyId: string }
  | { status: "mismatch"; reason: string }
  | {
      status: "credited"
      agencyId: string
      txId: string
      amount: number
      newBalance: number
    }

export interface ProcessWalletWebhookInput {
  provider: "stripe" | "sps" | "paymee"
  eventId: string
  eventType: string
  /** `null` quand le payload n'a pas pu être normalisé. */
  charge: NormalizedChargeEvent | null
  signatureOk: boolean
  /** Payload brut journalisé tel quel dans psp_webhooks (audit). */
  auditPayload: Record<string, unknown>
}

/**
 * Traite un événement PSP wallet déjà vérifié (signature) et normalisé.
 * Toute la logique métier (idempotence, corrélation, transitions d'état)
 * vit ici ; la route HTTP n'est qu'un adaptateur transport.
 */
export async function processWalletWebhookCore(
  tx: DrizzleTransaction,
  input: ProcessWalletWebhookInput,
): Promise<WalletWebhookOutcome> {
  const { provider, eventId, eventType, charge, signatureOk, auditPayload } =
    input

  const kind = classifyEventType(eventType)

  if (kind === "unknown" || !charge) {
    await tx.insert(pspWebhooks).values({
      agencyId: null,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
      error: !charge ? "UNPARSEABLE_PAYLOAD" : null,
    })
    return { status: "ignored" }
  }

  // Corrélation AVANT de consommer l'eventId (P0-A) : le paiement doit
  // référencer une demande de recharge en attente posée par
  // submitRechargeRequest (payment_reference == provider payment id).
  // Verrouillée pour éviter un double traitement concurrent avec
  // validateRechargeRequest (approbation manuelle) ou un autre webhook.
  const [pending] = await tx
    .select()
    .from(walletRechargeRequests)
    .where(eq(walletRechargeRequests.paymentReference, charge.providerRef))
    .for("update")

  if (!pending) {
    await tx.insert(pspWebhooks).values({
      agencyId: null,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
      error: "NO_MATCHING_RECHARGE_REQUEST",
    })
    // eventId intentionnellement non consommé : la demande orpheline reste
    // disponible pour un éventuel retry PSP.
    return { status: "no_match" }
  }

  // P0-B : Vérification d'identité PSP — évite le spoofing cross-PSP.
  // Un webhook Stripe pour une demande initiée via Paymee (ou l'inverse)
  // est rejeté AVANT de consommer l'eventId, préservant le retry PSP légitime.
  if (pending.psp !== null && pending.psp !== provider) {
    console.warn("[Webhook] PSP mismatch détecté", {
      requestId: pending.id,
      expected: pending.psp,
      got: provider,
    })
    await tx.insert(pspWebhooks).values({
      agencyId: pending.agencyId,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
      error: `PSP_MISMATCH:expected=${pending.psp}`,
    })
    // eventId intentionnellement non consommé.
    return { status: "no_match" }
  }

  /* --- Idempotence event-level — INSERT ON CONFLICT DO NOTHING.
   * Posé ICI, après corrélation + vérification PSP réussies (P0-A + P0-B).
   */
  const inserted = await tx
    .insert(paymentEvents)
    .values({ eventId, provider, eventType })
    .onConflictDoNothing()
    .returning({ eventId: paymentEvents.eventId })

  if (inserted.length === 0) {
    return { status: "duplicate" }
  }

  if (kind === "refunded") {
    // Un remboursement PSP ne peut annuler QUE une recharge déjà `validated`
    // (créditée) — sur une demande encore `pending` ou déjà `rejected`,
    // rien n'a jamais été crédité, donc rien à annuler. Traité AVANT le
    // garde-fou générique "déjà traité" ci-dessous : c'est justement le cas
    // `validated` que ce garde-fou intercepterait sinon, empêchant toute
    // annulation réelle.
    if (pending.status === "validated") {
      const reversal = await reverseRechargeCredit(tx, pending, {
        description: `Remboursement PSP — ${provider.toUpperCase()} (webhook ${eventType}, réf. ${charge.providerRef})`,
      })

      await tx.insert(pspWebhooks).values({
        agencyId: pending.agencyId,
        psp: provider,
        eventType,
        payload: auditPayload,
        signatureOk,
        processedAt: new Date(),
      })

      return {
        status: "refunded",
        agencyId: reversal.agencyId,
        txId: reversal.movementId,
        amount: reversal.amount,
        newBalance: reversal.newBalance,
      }
    }

    await tx.insert(pspWebhooks).values({
      agencyId: pending.agencyId,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
      error: "REFUND_ON_NON_VALIDATED_REQUEST",
    })
    return { status: "refund_ignored" }
  }

  if (pending.status !== "pending") {
    // Déjà traité (validé ou rejeté) — un second event_id pour le même
    // paiement (Stripe envoie souvent payment_intent.succeeded ET
    // charge.captured pour un seul paiement) ne doit jamais re-créditer.
    await tx.insert(pspWebhooks).values({
      agencyId: pending.agencyId,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
      error: `ALREADY_PROCESSED:${pending.status}`,
    })
    return { status: "already_processed" }
  }

  if (kind === "failed") {
    await tx
      .update(walletRechargeRequests)
      .set({
        status: "rejected",
        rejectionReason: "Paiement refusé par le PSP",
        reviewedByUserId: null,
        reviewedAt: new Date(),
      })
      .where(eq(walletRechargeRequests.id, pending.id))

    await tx.insert(pspWebhooks).values({
      agencyId: pending.agencyId,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
    })
    return { status: "payment_failed", agencyId: pending.agencyId }
  }

  // kind === "succeeded" (seule possibilité restante : "refunded" et
  // "failed" ont tous les deux été traités ci-dessus, "unknown" filtré plus tôt)
  const match = matchesPendingRecharge(pending, charge)
  if (!match.ok) {
    await tx
      .update(walletRechargeRequests)
      .set({
        status: "rejected",
        rejectionReason: `Paiement PSP non conforme à la demande (${match.reason})`,
        reviewedByUserId: null,
        reviewedAt: new Date(),
      })
      .where(eq(walletRechargeRequests.id, pending.id))

    await tx.insert(pspWebhooks).values({
      agencyId: pending.agencyId,
      psp: provider,
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
      error: match.reason,
    })
    console.warn("[Webhook] Paiement PSP rejeté — écart avec la demande", {
      requestId: pending.id,
      reason: match.reason,
    })
    return { status: "mismatch", reason: match.reason }
  }

  const outcome = await creditRechargeRequest(tx, pending, {
    reviewedByUserId: null,
    description: `Recharge en ligne — ${provider.toUpperCase()} (webhook ${eventType}, réf. ${charge.providerRef})`,
  })

  await tx.insert(pspWebhooks).values({
    agencyId: pending.agencyId,
    psp: provider,
    eventType,
    payload: auditPayload,
    signatureOk,
    processedAt: new Date(),
  })

  return {
    status: "credited",
    agencyId: outcome.agencyId,
    txId: outcome.movementId,
    amount: outcome.amount,
    newBalance: outcome.newBalance,
  }
}
