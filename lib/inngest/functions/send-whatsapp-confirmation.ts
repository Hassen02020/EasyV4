/**
 * Inngest function — notification WhatsApp client (booking/confirmed).
 *
 * Fonction séparée de `processConfirmedBooking` (PDF + email) exprès :
 * chaque canal a ses propres retries, un échec WhatsApp ne doit jamais
 * bloquer ni retarder l'email (et inversement) — même événement, deux
 * branches indépendantes du Event/Retry Engine, comme sur le diagramme
 * cible (Email / WhatsApp / CRM en parallèle).
 *
 * Utilise le template `WHATSAPP_TEMPLATE_NAME` (doit être pré-approuvé
 * dans le Meta Business Manager pour le numéro configuré — voir
 * lib/whatsapp/provider.ts). Si aucun credential WhatsApp n'est configuré,
 * ou si le client n'a pas de numéro, l'étape est proprement ignorée (pas
 * un échec, pas un faux succès).
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { getWhatsAppProvider, hasConfiguredWhatsAppProvider } from "@/lib/whatsapp/provider"

export const sendWhatsAppConfirmation = inngest.createFunction(
  {
    id: "send-whatsapp-confirmation",
    name: "Réservation confirmée — notification WhatsApp",
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

    return step.run("send-whatsapp-template", async () => {
      if (!hasConfiguredWhatsAppProvider()) {
        return { skipped: true, reason: "WHATSAPP_PROVIDER_NOT_CONFIGURED" }
      }
      if (!d.customerPhone) {
        return { skipped: true, reason: "NO_CUSTOMER_PHONE" }
      }

      const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "booking_confirmed"
      const languageCode = process.env.WHATSAPP_TEMPLATE_LANG || "fr"

      const result = await getWhatsAppProvider().sendTemplateMessage({
        to: d.customerPhone,
        templateName,
        languageCode,
        bodyParams: [
          d.customerName,
          d.publicRef,
          d.hotelName,
          d.checkIn,
          d.checkOut,
          `${d.totalTnd.toLocaleString("fr-FR")} DT`,
        ],
      })

      if (!result.ok) {
        // Un échec réel (pas "not configured"/"no phone", déjà court-circuités
        // ci-dessus) doit throw pour déclencher le retry Inngest.
        throw new Error(`WhatsApp send failed: ${result.code} — ${result.message}`)
      }

      return { sent: true, providerMessageId: result.providerMessageId }
    })
  },
)
