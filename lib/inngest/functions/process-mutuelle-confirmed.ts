/**
 * Inngest function — booking/mutuelle.confirmed
 *
 * Après confirmation d'une réservation Mutuelle B2B2C :
 *  Envoie email récapitulatif au membre.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { Resend } from "resend"
import { makeOnFailure } from "@/lib/inngest/on-failure"

export const processMutuelleConfirmed = inngest.createFunction(
  {
    id: "process-mutuelle-confirmed",
    name: "Mutuelle B2B2C confirmée — email récapitulatif membre",
    triggers: { event: "booking/mutuelle.confirmed" },
    onFailure: makeOnFailure("process-mutuelle-confirmed"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: Events["booking/mutuelle.confirmed"]["data"] }
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const d = event.data

    await step.run("send-mutuelle-email", async () => {
      if (!process.env.RESEND_API_KEY) return { skipped: true }
      const resend = new Resend(process.env.RESEND_API_KEY)

      const { error } = await resend.emails.send({
        from: "Easy2Book <mutuelle@easy2book.tn>",
        to: d.contactEmail,
        subject: `Votre demande Mutuelle est confirmée — ${d.publicRef}`,
        html: `
          <h2>Votre demande Mutuelle a été approuvée</h2>
          <p><strong>Référence :</strong> ${d.publicRef}</p>
          <p><strong>Type de voyage :</strong> ${d.moduleName}</p>
          <p><strong>Départ :</strong> ${d.travelStartDate}</p>
          <p><strong>Retour :</strong> ${d.travelEndDate}</p>
          <p><strong>Voyageurs :</strong> ${d.paxCount}</p>
          <p><strong>Total :</strong> ${d.totalTnd.toLocaleString("fr-FR")} DT</p>
          <hr/>
          <p>Votre dossier est en cours de traitement par votre agence. Vous serez contacté prochainement.</p>
          <p>Easy2Book — Votre partenaire voyage</p>
        `,
      })

      if (error) {
        console.error("[process-mutuelle-confirmed] envoi email échoué", {
          reservationId: d.reservationId,
          publicRef: d.publicRef,
          error: error.message,
        })
        return { sent: false, error: error.message }
      }
      return { sent: true }
    })

    return { reservationId: d.reservationId }
  },
)
