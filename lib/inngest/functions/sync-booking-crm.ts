/**
 * Inngest function — synchronisation CRM (booking/confirmed).
 *
 * Branche "CRM" du Event/Retry Engine, en parallèle d'Email/WhatsApp.
 * Toute la logique (idempotence, audit, appel provider) vit dans
 * lib/crm/sync-booking.ts — directement testable sans harnais Inngest.
 * Ce fichier n'est qu'un fin wrapper de câblage.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { syncBookingToCrm } from "@/lib/crm/sync-booking"
import { makeOnFailure } from "@/lib/inngest/on-failure"

export const syncBookingCrm = inngest.createFunction(
  {
    id: "sync-booking-crm",
    name: "Réservation confirmée — synchronisation CRM",
    retries: 3,
    triggers: { event: "booking/confirmed" },
    onFailure: makeOnFailure("sync-booking-crm"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: Events["booking/confirmed"]["data"] }
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const d = event.data

    return step.run("sync-crm", async () => {
      const outcome = await syncBookingToCrm({
        reservationId: d.reservationId,
        agencyId: d.agencyId,
        publicRef: d.publicRef,
        customerEmail: d.customerEmail,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        totalTnd: d.totalTnd,
      })

      if (outcome.outcome === "failed") {
        throw new Error(`CRM sync failed: ${outcome.code} — ${outcome.message}`)
      }

      return outcome
    })
  },
)
