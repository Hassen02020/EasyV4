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

import { inngest } from "../client"
import { renderVoucherPdf } from "@/lib/pdf/voucher-hotel"
import { sendVoucherEmail } from "@/lib/email/send-voucher"
import { getDb } from "@/lib/db/client"
import { reservations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export const processConfirmedBooking = inngest.createFunction(
  {
    id: "process-confirmed-booking",
    name: "Process Confirmed Booking — PDF + Email",
    retries: 3,
    triggers: { event: "booking/confirmed" },
  },
  async ({ event }: any) => {
    const {
      reservationId,
      publicRef,
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
      hotelName,
      checkIn,
      checkOut,
      nights,
      pdfBase64,
    })

    /* Step 3 — Mettre à jour la réservation */
    const db = getDb()
    await db
      .update(reservations)
      .set({ updatedAt: new Date() })
      .where(eq(reservations.id, reservationId))

    return { success: true, reservationId, publicRef }
  },
)
