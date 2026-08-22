/**
 * Inngest function — synchronisation CRM (booking/confirmed).
 *
 * Branche "CRM" du Event/Retry Engine, en parallèle d'Email/WhatsApp.
 * Aucun système CRM n'est choisi/configuré pour ce projet (voir
 * lib/crm/provider.ts) — cette fonction existe pour que le point d'entrée
 * du pipeline soit déjà câblé, mais s'arrête proprement (pas un échec, pas
 * de retry gaspillé contre un état permanent) tant qu'aucun adaptateur
 * réel n'est branché dans `getCrmProvider()`.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { getCrmProvider, hasConfiguredCrmProvider } from "@/lib/crm/provider"

export const syncBookingCrm = inngest.createFunction(
  {
    id: "sync-booking-crm",
    name: "Réservation confirmée — synchronisation CRM",
    retries: 3,
    triggers: { event: "booking/confirmed" },
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
      if (!hasConfiguredCrmProvider()) {
        return { skipped: true, reason: "CRM_PROVIDER_NOT_CONFIGURED" }
      }

      const result = await getCrmProvider().syncBooking({
        reservationId: d.reservationId,
        publicRef: d.publicRef,
        agencyId: d.agencyId,
        customerEmail: d.customerEmail,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        totalTnd: d.totalTnd,
        confirmedAt: new Date().toISOString(),
      })

      if (!result.ok) {
        throw new Error(`CRM sync failed: ${result.code} — ${result.message}`)
      }

      return { synced: true, providerRecordId: result.providerRecordId }
    })
  },
)
