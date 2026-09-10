/**
 * Cœur transactionnel du webhook PSP de paiement de réservation B2C —
 * extrait de app/api/payment/reservation-webhook/route.ts (qui ne peut pas
 * exporter de fonction non-HTTP) pour rester testable en DB-mode sans
 * requête HTTP réelle, même discipline que lib/reviews/reviews-core.ts/
 * lib/favorites/favorites-core.ts. La route HTTP reste responsable
 * UNIQUEMENT de : parsing du corps, vérification de signature, et
 * déclenchement best-effort (facture/notification) hors transaction après
 * un `captured_confirmed`.
 *
 * Voir app/api/payment/reservation-webhook/route.ts pour les garanties de
 * sécurité complètes (idempotence event/business-level, corrélation
 * stricte montant/devise, cohérence paiement ↔ réservation).
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  paymentEvents,
  pspWebhooks,
  payments,
  reservations,
  reservationHotel,
  customers,
  auditEvents,
} from "@/lib/db/schema"
import { TND_EPSILON } from "@/lib/finance/payment-summary"
import { isTransitionAllowed } from "@/lib/admin/reservation-status"
import { matchesPendingPayment } from "@/lib/payment/reservation-payment-logic"
import { classifyEventType, type NormalizedChargeEvent } from "@/lib/payment/webhook-logic"

export type WebhookOutcome =
  | { status: "duplicate" }
  | { status: "ignored" }
  | { status: "no_match" }
  | { status: "already_processed" }
  | { status: "mismatch"; reason: string }
  | { status: "payment_failed"; reservationId: string }
  | { status: "captured_confirmed"; reservationId: string; publicRef: string; agencyId: string }
  | { status: "captured_not_confirmable"; reservationId: string }
  | { status: "refunded"; reservationId: string; fullyRefunded: boolean }
  | { status: "refund_ignored" }

export interface ProcessReservationWebhookInput {
  provider: "stripe" | "sps" | "paymee"
  eventId: string
  eventType: string
  /** `null` quand le payload n'a pas pu être normalisé (parsé mais forme inattendue). */
  charge: NormalizedChargeEvent | null
  signatureOk: boolean
  /** Payload brut journalisé tel quel dans psp_webhooks (audit). */
  rawPayload: Record<string, unknown>
}

/**
 * Traite un événement PSP déjà vérifié (signature) et normalisé — jamais
 * appelé avec un payload dont la signature n'a pas été vérifiée AVANT.
 * Toute la logique métier (idempotence, corrélation, transitions d'état)
 * vit ici ; la route HTTP n'est qu'un adaptateur transport.
 */
export async function processReservationWebhookCore(
  tx: DrizzleTransaction,
  input: ProcessReservationWebhookInput,
): Promise<WebhookOutcome> {
  const { provider, eventId, eventType, charge, signatureOk, rawPayload } = input

  /* --- Idempotence event-level — INSERT ON CONFLICT DO NOTHING --- */
  const inserted = await tx
    .insert(paymentEvents)
    .values({ eventId, provider, eventType })
    .onConflictDoNothing()
    .returning({ eventId: paymentEvents.eventId })

  if (inserted.length === 0) {
    return { status: "duplicate" }
  }

  const kind = classifyEventType(eventType)

  if (kind === "unknown" || !charge) {
    await tx.insert(pspWebhooks).values({
      agencyId: null,
      psp: provider,
      eventType,
      payload: rawPayload,
      signatureOk,
      processedAt: new Date(),
      error: !charge ? "UNPARSEABLE_PAYLOAD" : null,
    })
    return { status: "ignored" }
  }

  // Corrélation : le paiement doit référencer une ligne `payments` posée au
  // moment du checkout (createPayment) — jamais wallet_recharge_requests.
  const [payment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.pspOrderId, charge.providerRef))
    .for("update")

  if (!payment) {
    await tx.insert(pspWebhooks).values({
      agencyId: null,
      psp: provider,
      eventType,
      payload: rawPayload,
      signatureOk,
      processedAt: new Date(),
      error: "NO_MATCHING_PAYMENT",
    })
    return { status: "no_match" }
  }

  const [reservation] = await tx
    .select()
    .from(reservations)
    .where(eq(reservations.id, payment.reservationId))
    .for("update")

  await tx
    .update(paymentEvents)
    .set({ reservationId: payment.reservationId })
    .where(eq(paymentEvents.eventId, eventId))

  /* --- Remboursement PSP --- */
  if (kind === "refunded") {
    if (payment.status !== "captured" && payment.status !== "partial_refund") {
      await tx.insert(pspWebhooks).values({
        agencyId: payment.agencyId,
        psp: provider,
        eventType,
        payload: rawPayload,
        signatureOk,
        processedAt: new Date(),
        error: "REFUND_ON_NON_CAPTURED_PAYMENT",
      })
      return { status: "refund_ignored" }
    }

    const alreadyRefunded = Number.parseFloat(payment.refundedAmount)
    const capturedTnd = Number.parseFloat(payment.tndAmount)
    const newRefundedAmount = Math.min(alreadyRefunded + charge.amountTnd, capturedTnd)
    const fullyRefunded = capturedTnd - newRefundedAmount <= TND_EPSILON

    await tx
      .update(payments)
      .set({
        status: fullyRefunded ? "refunded" : "partial_refund",
        refundedAmount: newRefundedAmount.toFixed(2),
        refundedAt: new Date(),
        rawResponse: rawPayload,
      })
      .where(eq(payments.id, payment.id))

    if (fullyRefunded && reservation && isTransitionAllowed(reservation.status, "refunded")) {
      await tx
        .update(reservations)
        .set({ status: "refunded", updatedAt: new Date() })
        .where(eq(reservations.id, reservation.id))
    }

    await tx.insert(pspWebhooks).values({
      agencyId: payment.agencyId,
      psp: provider,
      eventType,
      payload: rawPayload,
      signatureOk,
      processedAt: new Date(),
    })

    return { status: "refunded", reservationId: payment.reservationId, fullyRefunded }
  }

  /* --- Idempotence business-level : déjà traité (capturé/échoué) --- */
  if (payment.status !== "pending") {
    await tx.insert(pspWebhooks).values({
      agencyId: payment.agencyId,
      psp: provider,
      eventType,
      payload: rawPayload,
      signatureOk,
      processedAt: new Date(),
      error: `ALREADY_PROCESSED:${payment.status}`,
    })
    return { status: "already_processed" }
  }

  if (kind === "failed") {
    await tx
      .update(payments)
      .set({ status: "failed", rawResponse: rawPayload })
      .where(eq(payments.id, payment.id))

    await tx.insert(pspWebhooks).values({
      agencyId: payment.agencyId,
      psp: provider,
      eventType,
      payload: rawPayload,
      signatureOk,
      processedAt: new Date(),
    })
    return { status: "payment_failed", reservationId: payment.reservationId }
  }

  // kind === "succeeded"
  const match = matchesPendingPayment(payment, charge)
  if (!match.ok) {
    await tx
      .update(payments)
      .set({ status: "failed", rawResponse: rawPayload })
      .where(eq(payments.id, payment.id))

    await tx.insert(pspWebhooks).values({
      agencyId: payment.agencyId,
      psp: provider,
      eventType,
      payload: rawPayload,
      signatureOk,
      processedAt: new Date(),
      error: match.reason,
    })
    return { status: "mismatch", reason: match.reason }
  }

  // L'argent a réellement été reçu — toujours enregistré `captured`, même
  // si la réservation ne peut plus être confirmée (voir note de fichier
  // de la route). idempotencyKey posé pour cohérence avec le reste du grand
  // livre (payments_capture_idempotency_uniq), sans effet ici puisqu'on
  // UPDATE une ligne déjà existante plutôt que d'en INSERT une nouvelle.
  await tx
    .update(payments)
    .set({
      status: "captured",
      pspTransactionId: charge.eventId,
      idempotencyKey: payment.pspOrderId,
      capturedAt: new Date(),
      rawResponse: rawPayload,
    })
    .where(eq(payments.id, payment.id))

  await tx.insert(pspWebhooks).values({
    agencyId: payment.agencyId,
    psp: provider,
    eventType,
    payload: rawPayload,
    signatureOk,
    processedAt: new Date(),
  })

  if (!reservation || reservation.status !== "pending" || !isTransitionAllowed(reservation.status, "confirmed")) {
    // Paiement reçu mais réservation non confirmable (expirée par le cron
    // entre-temps, déjà annulée...) — jamais une confirmation forcée, jamais
    // une perte de trace du paiement réel. Signalé pour réconciliation
    // manuelle staff.
    await tx.insert(auditEvents).values({
      agencyId: payment.agencyId,
      actorUserId: null,
      entityType: "reservation",
      entityId: payment.reservationId,
      action: "payment.psp_unreconciled",
      diff: {
        reason: "RESERVATION_NOT_CONFIRMABLE",
        reservationStatus: reservation?.status ?? "unknown",
        paymentId: payment.id,
        amountTnd: payment.tndAmount,
      },
    })
    return { status: "captured_not_confirmable", reservationId: payment.reservationId }
  }

  await tx
    .update(reservations)
    .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(reservations.id, reservation.id))

  await tx.insert(auditEvents).values({
    agencyId: payment.agencyId,
    actorUserId: null,
    entityType: "reservation",
    entityId: reservation.id,
    action: "payment.psp_captured",
    diff: {
      publicRef: reservation.publicRef,
      psp: provider,
      amountTnd: payment.tndAmount,
    },
  })

  return {
    status: "captured_confirmed",
    reservationId: reservation.id,
    publicRef: reservation.publicRef,
    agencyId: payment.agencyId,
  }
}

export interface ConfirmedBookingDetail {
  module: string
  totalTnd: number
  guestAccessToken: string
  customerEmail: string | null
  customerName: string
  customerPhone: string | null
  hotelName: string | null
  checkIn: string | null
  checkOut: string | null
  nights: number | null
  adults: number | null
  children: number
}

/** Détail nécessaire pour déclencher facture/voucher après confirmation —
 * même requête que lib/finance/manual-payment-actions.ts, extraite ici pour
 * réutilisation par la route ET les tests. */
export async function loadConfirmedBookingDetail(
  tx: DrizzleTransaction,
  reservationId: string,
): Promise<ConfirmedBookingDetail | null> {
  const [detail] = await tx
    .select({
      module: reservations.module,
      tndAmount: reservations.tndAmount,
      guestAccessToken: reservations.guestAccessToken,
      customerEmail: customers.email,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerPhone: customers.phone,
      hotelName: reservationHotel.hotelName,
      checkIn: reservationHotel.checkIn,
      checkOut: reservationHotel.checkOut,
      nights: reservationHotel.nights,
      adults: reservationHotel.adults,
      childrenAges: reservationHotel.childrenAges,
    })
    .from(reservations)
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .leftJoin(reservationHotel, eq(reservationHotel.reservationId, reservations.id))
    .where(eq(reservations.id, reservationId))
    .limit(1)

  if (!detail) return null
  return {
    module: detail.module,
    totalTnd: Number.parseFloat(detail.tndAmount),
    guestAccessToken: detail.guestAccessToken,
    customerEmail: detail.customerEmail,
    customerName: `${detail.customerFirstName} ${detail.customerLastName}`.trim(),
    customerPhone: detail.customerPhone,
    hotelName: detail.hotelName,
    checkIn: detail.checkIn,
    checkOut: detail.checkOut,
    nights: detail.nights,
    adults: detail.adults,
    children: detail.childrenAges?.length ?? 0,
  }
}
