/**
 * Inngest function — booking/package.confirmed
 *
 * Après confirmation d'une réservation Voyage organisé (Package) :
 *  Envoie email récapitulatif au client.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { Resend } from "resend"
import { makeOnFailure } from "@/lib/inngest/on-failure"

export const processPackageConfirmed = inngest.createFunction(
  {
    id: "process-package-confirmed",
    name: "Package confirmé — email récapitulatif",
    triggers: { event: "booking/package.confirmed" },
    onFailure: makeOnFailure("process-package-confirmed"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: Events["booking/package.confirmed"]["data"] }
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const d = event.data

    await step.run("send-package-email", async () => {
      if (!process.env.RESEND_API_KEY) return { skipped: true }
      const resend = new Resend(process.env.RESEND_API_KEY)

      const { error } = await resend.emails.send({
        from: "Easy2Book <voyages@easy2book.tn>",
        to: d.contactEmail,
        subject: `Confirmation voyage ${d.publicRef} — ${d.packageName}`,
        html: `
          <h2>Votre réservation est confirmée</h2>
          <p><strong>Référence :</strong> ${d.publicRef}</p>
          <p><strong>Voyage :</strong> ${d.packageName}</p>
          <p><strong>Départ :</strong> ${new Date(d.departureDate).toLocaleDateString("fr-FR")}</p>
          <p><strong>Voyageurs :</strong> ${d.paxCount}</p>
          <p><strong>Total :</strong> ${d.totalTnd.toLocaleString("fr-FR")} DT</p>
          <hr/>
          <p>Notre équipe vous contactera pour finaliser les détails de votre voyage.</p>
          <p>Easy2Book — Votre partenaire voyage</p>
        `,
      })

      if (error) {
        console.error("[process-package-confirmed] envoi email échoué", {
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
