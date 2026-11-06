/**
 * Inngest function — notification WhatsApp client (booking/confirmed).
 *
 * Fonction séparée de `processConfirmedBooking` (PDF + email) exprès :
 * chaque canal a ses propres retries, un échec WhatsApp ne doit jamais
 * bloquer ni retarder l'email (et inversement) — même événement, deux
 * branches indépendantes du Event/Retry Engine, comme sur le diagramme
 * cible (Email / WhatsApp / CRM en parallèle).
 *
 * Toute la logique métier (idempotence, audit, appel provider) vit dans
 * lib/whatsapp/send-booking-confirmation.ts — directement testable sans
 * harnais Inngest. Ce fichier n'est qu'un fin wrapper de câblage.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { sendBookingConfirmationWhatsApp } from "@/lib/whatsapp/send-booking-confirmation"
import { makeOnFailure } from "@/lib/inngest/on-failure"

export const sendWhatsAppConfirmation = inngest.createFunction(
  {
    id: "send-whatsapp-confirmation",
    name: "Réservation confirmée — notification WhatsApp",
    retries: 3,
    triggers: { event: "booking/confirmed" },
    onFailure: makeOnFailure("send-whatsapp-confirmation"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: Events["booking/confirmed"]["data"] }
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const d = event.data

    return step.run("send-whatsapp-template", async () => {
      const outcome = await sendBookingConfirmationWhatsApp({
        reservationId: d.reservationId,
        agencyId: d.agencyId,
        publicRef: d.publicRef,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        hotelName: d.hotelName,
        checkIn: d.checkIn,
        checkOut: d.checkOut,
        totalTnd: d.totalTnd,
      })

      // WHATSAPP-CRM-01 (W-08) : seul un échec temporaire (réseau, 429,
      // 5xx) est relancé ; un échec définitif (numéro invalide, refus 4xx)
      // est déjà tracé et ne doit pas être retenté 3 fois.
      if (outcome.outcome === "failed" && outcome.retryable) {
        // Échec réel (pas already_sent/skipped, déjà terminaux) → throw
        // pour déclencher le retry Inngest.
        throw new Error(
          `WhatsApp send failed: ${outcome.code} — ${outcome.message}`,
        )
      }

      return outcome
    })
  },
)
