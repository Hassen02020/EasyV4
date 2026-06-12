/**
 * Inngest function — booking/omra.confirmed
 *
 * Après confirmation d'une réservation Omra :
 *  1. Envoie email récapitulatif dossier pèlerins.
 *  2. Déclenche génération PDF (billet collectif) via booking/confirmed.
 */

import { inngest } from "@/lib/inngest/client"
import { Resend } from "resend"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _inngest = inngest as any

export const processOmraConfirmed = _inngest.createFunction(
  { id: "process-omra-confirmed", name: "Omra confirmée — dossier & email" },
  { event: "booking/omra.confirmed" },
  async ({ event, step }: any) => {
    const d = event.data

    await step.run("send-omra-email", async () => {
      if (!process.env.RESEND_API_KEY) return { skipped: true }
      const resend = new Resend(process.env.RESEND_API_KEY)

      await resend.emails.send({
        from: "Easy2Book Omraty <omra@easy2book.tn>",
        to: d.contactEmail,
        subject: `Confirmation Omra ${d.publicRef} — ${d.packageName}`,
        html: `
          <h2>Votre réservation Omra est confirmée</h2>
          <p><strong>Référence :</strong> ${d.publicRef}</p>
          <p><strong>Package :</strong> ${d.packageName}</p>
          <p><strong>Pèlerins :</strong> ${d.pilgrimsCount}</p>
          <p><strong>Départ :</strong> ${new Date(d.departureDate).toLocaleDateString("fr-FR")}</p>
          <p><strong>Total :</strong> ${d.totalTnd.toLocaleString("fr-FR")} DT</p>
          <hr/>
          <p>Notre équipe vous contactera dans les 48h pour finaliser votre dossier visa et billets d'avion.</p>
          <p>Easy2Book Omraty — La Mecque & Médine avec confiance</p>
        `,
      })
    })

    return { reservationId: d.reservationId }
  },
)
