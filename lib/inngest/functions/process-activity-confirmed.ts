/**
 * Inngest function — booking/activity.confirmed
 *
 * Après confirmation d'une réservation Attraction (Activity) :
 *  Envoie email récapitulatif au client.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { Resend } from "resend"
import { makeOnFailure } from "@/lib/inngest/on-failure"

export const processActivityConfirmed = inngest.createFunction(
  {
    id: "process-activity-confirmed",
    name: "Attraction confirmée — email récapitulatif",
    triggers: { event: "booking/activity.confirmed" },
    onFailure: makeOnFailure("process-activity-confirmed"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: Events["booking/activity.confirmed"]["data"] }
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const d = event.data

    await step.run("send-activity-email", async () => {
      if (!process.env.RESEND_API_KEY) return { skipped: true }
      const resend = new Resend(process.env.RESEND_API_KEY)

      const { error } = await resend.emails.send({
        from: "Easy2Book <activites@easy2book.tn>",
        to: d.contactEmail,
        subject: `Confirmation attraction ${d.publicRef} — ${d.activityTitle}`,
        html: `
          <h2>Votre réservation est confirmée</h2>
          <p><strong>Référence :</strong> ${d.publicRef}</p>
          <p><strong>Attraction :</strong> ${d.activityTitle}</p>
          <p><strong>Voyageurs :</strong> ${d.paxCount}</p>
          <p><strong>Total :</strong> ${d.totalTnd.toLocaleString("fr-FR")} DT</p>
          <hr/>
          <p>Votre bon d'entrée est disponible dans votre espace client.</p>
          <p>Easy2Book — Votre partenaire voyage</p>
        `,
      })

      if (error) {
        console.error("[process-activity-confirmed] envoi email échoué", {
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
