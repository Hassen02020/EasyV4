/**
 * Inngest Function — processConfirmedBooking
 *
 * Déclenchée par l'événement "booking/confirmed".
 * Étapes :
 *   1. Générer le PDF Voucher Hôtel via @react-pdf/renderer
 *   2. Envoyer l'email client avec le voucher en PJ via Resend
 *   3. Mettre à jour la réservation (voucherSentAt)
 *
 * Exécution en arrière-plan → pas de timeout Vercel (max 5 min Inngest).
 */

import { inngest, type Events } from "../client"
import { renderVoucherPdf } from "@/lib/pdf/voucher-hotel"
import { sendVoucherEmail } from "@/lib/email/send-voucher"
import { withSystemContext } from "@/lib/db/tenant-context"
import { auditEvents, reservations } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { makeOnFailure } from "@/lib/inngest/on-failure"

const ACTION_VOUCHER_EMAIL_SENT = "notification.voucher_email.sent"

/**
 * Idempotence (Phase 20) — même mécanisme que
 * lib/whatsapp/send-booking-confirmation.ts : `audit_events` comme source
 * de vérité "cet envoi a-t-il déjà réussi ?", vérifié avant toute tentative.
 * Un retry Inngest après un succès partiel (email envoyé, réponse perdue)
 * ne renvoie donc plus le PDF en double. Pas un risque financier — cette
 * fonction ne touche jamais `payments`/`wallet_*`, uniquement un touch
 * idempotent de `reservations.updatedAt` (sûr à répéter).
 */
async function hasVoucherEmailAlreadySucceeded(reservationId: string): Promise<boolean> {
  const [existing] = await withSystemContext((tx) =>
    tx
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityType, "reservation"),
          eq(auditEvents.entityId, reservationId),
          eq(auditEvents.action, ACTION_VOUCHER_EMAIL_SENT),
        ),
      )
      .limit(1),
  )
  return Boolean(existing)
}

async function recordVoucherEmailSent(agencyId: string, reservationId: string, publicRef: string): Promise<void> {
  try {
    await withSystemContext((tx) =>
      tx.insert(auditEvents).values({
        agencyId,
        entityType: "reservation",
        entityId: reservationId,
        action: ACTION_VOUCHER_EMAIL_SENT,
        diff: { publicRef },
      }),
    )
  } catch (err) {
    // audit_events_notification_success_uniq — course authentiquement
    // concurrente (ex. livraison dupliquée d'événement) : no-op idempotent.
    const pgErr = err as { code?: string }
    if (pgErr.code === "23505") return
    throw err
  }
}

export const processConfirmedBooking = inngest.createFunction(
  {
    id: "process-confirmed-booking",
    name: "Process Confirmed Booking — PDF + Email",
    retries: 3,
    triggers: { event: "booking/confirmed" },
    onFailure: makeOnFailure("process-confirmed-booking"),
  },
  async ({ event }: { event: { data: Events["booking/confirmed"]["data"] } }) => {
    const {
      reservationId,
      publicRef,
      agencyId,
      guestAccessToken,
      customerEmail,
      customerName,
      hotelName,
      checkIn,
      checkOut,
      nights,
      adults,
      children,
      totalTnd,
    } = event.data

    // --- Idempotence : ne jamais renvoyer un voucher déjà confirmé envoyé. ---
    if (await hasVoucherEmailAlreadySucceeded(reservationId)) {
      return { success: true, reservationId, publicRef, alreadySent: true }
    }

    /* Step 1 — Générer le PDF voucher */
    const buffer = await renderVoucherPdf({
      publicRef,
      customerName,
      hotelName,
      checkIn,
      checkOut,
      nights,
      adults,
      children,
      totalTnd,
    })
    // Inngest sérialise en JSON → on encode en base64
    const pdfBase64 = Buffer.from(buffer).toString("base64")

    /* Step 2 — Envoyer l'email avec PJ */
    await sendVoucherEmail({
      to: customerEmail,
      customerName,
      publicRef,
      guestAccessToken,
      hotelName,
      checkIn,
      checkOut,
      nights,
      pdfBase64,
    })

    /* Step 3 — Mettre à jour la réservation.
     * Job Inngest déclenché en arrière-plan par le serveur (pas de session
     * Supabase à résoudre) — appelant système de confiance. */
    await withSystemContext((db) =>
      db
        .update(reservations)
        .set({ updatedAt: new Date() })
        .where(eq(reservations.id, reservationId)),
    )

    await recordVoucherEmailSent(agencyId, reservationId, publicRef)

    return { success: true, reservationId, publicRef }
  },
)
