/**
 * Inngest function — booking/transfer.confirmed
 *
 * Après confirmation d'un transfert :
 *  1. Envoie email de confirmation au client (Resend).
 *  2. Envoie SMS Twilio au chauffeur si TWILIO_* configuré.
 */

import { inngest } from "@/lib/inngest/client"
import { Resend } from "resend"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _inngest = inngest as any

export const processTransferConfirmed = _inngest.createFunction(
  {
    id: "process-transfer-confirmed",
    name: "Transfert confirmé — notifications",
    triggers: { event: "booking/transfer.confirmed" },
  },
  async ({ event, step }: any) => {
    const d = event.data

    await step.run("send-client-email", async () => {
      if (!process.env.RESEND_API_KEY) return { skipped: true }
      const resend = new Resend(process.env.RESEND_API_KEY)

      await resend.emails.send({
        from: "Easy2Book <noreply@easy2book.tn>",
        to: d.customerEmail,
        subject: `Confirmation transfert ${d.publicRef}`,
        html: `
          <h2>Votre transfert est confirmé !</h2>
          <p><strong>Référence :</strong> ${d.publicRef}</p>
          <p><strong>Trajet :</strong> ${d.fromZone} → ${d.toZone}</p>
          <p><strong>Date & heure :</strong> ${new Date(d.pickupAt).toLocaleString("fr-FR")}</p>
          <p><strong>Véhicule :</strong> ${d.vehicleType}</p>
          <p><strong>Total :</strong> ${d.totalTnd.toLocaleString("fr-FR")} DT</p>
          <hr/>
          <p>L'équipe Easy2Book</p>
        `,
      })
    })

    await step.run("send-driver-sms", async () => {
      if (
        !process.env.TWILIO_ACCOUNT_SID ||
        !process.env.TWILIO_AUTH_TOKEN ||
        !process.env.TWILIO_FROM_NUMBER
      ) {
        return { skipped: true }
      }

      const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`
      const body = new URLSearchParams({
        From: process.env.TWILIO_FROM_NUMBER,
        To: d.customerPhone,
        Body: `Easy2Book - Transfert ${d.publicRef} confirmé. ${d.fromZone}→${d.toZone} le ${new Date(d.pickupAt).toLocaleString("fr-FR")}. Total: ${d.totalTnd} DT.`,
      })

      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      })
    })

    return { reservationId: d.reservationId }
  },
)
