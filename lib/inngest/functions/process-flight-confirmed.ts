/**
 * Inngest function — booking/flight.confirmed
 *
 * Après confirmation d'une réservation Vol : envoie l'email récapitulatif
 * (PNR + vol) — même patron que process-omra-confirmed.ts. Aucune
 * génération de billet PDF pour l'instant (pas de voucher-flight.tsx tant
 * que ce n'est pas construit) : le PNR affiché dans l'email et sur
 * /compte reste la preuve de réservation.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { Resend } from "resend"
import { makeOnFailure } from "@/lib/inngest/on-failure"

export const processFlightConfirmed = inngest.createFunction(
  {
    id: "process-flight-confirmed",
    name: "Vol confirmé — email",
    triggers: { event: "booking/flight.confirmed" },
    onFailure: makeOnFailure("process-flight-confirmed"),
  },
  async ({
    event,
  }: {
    event: { data: Events["booking/flight.confirmed"]["data"] }
  }) => {
    const d = event.data

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error } = await resend.emails.send({
        from: "Easy2Book Vols <vols@easy2book.tn>",
        to: d.customerEmail,
        subject: `Confirmation de vol ${d.publicRef} — ${d.origin} → ${d.destination}`,
        html: `
          <h2>Votre réservation de vol est confirmée</h2>
          <p><strong>Référence :</strong> ${d.publicRef}</p>
          <p><strong>Vol :</strong> ${d.origin} → ${d.destination} (${d.carrier}${d.flightNumber})</p>
          <p><strong>Départ :</strong> ${new Date(d.departureAt).toLocaleString("fr-FR")}</p>
          <p><strong>Passagers :</strong> ${d.adults + d.children}</p>
          <p><strong>Total :</strong> ${d.totalTnd.toLocaleString("fr-FR")} DT</p>
          <hr/>
          <p>Easy2Book Vols</p>
        `,
      })
      if (error) {
        // Throw so Inngest's built-in retry fires — returning { sent: false } would
        // mark the run as succeeded and suppress all retries.
        throw new Error(`[process-flight-confirmed] envoi email échoué — ${error.message} (ref: ${d.publicRef})`)
      }
    }

    return { reservationId: d.reservationId }
  },
)
