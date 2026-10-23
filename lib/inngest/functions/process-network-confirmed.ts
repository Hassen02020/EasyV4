/**
 * Inngest function — booking/network.confirmed
 *
 * Après confirmation d'une réservation Network B2C (NETWORK-B2C-01) :
 *  1. Envoie email récapitulatif au client.
 *  2. Génère la facture "paid" (CAS-C, fast-path) — déplacé depuis
 *     lib/network/guest-booking-actions.ts : `step.run` est persistant
 *     côté Inngest, retries automatiques si cette étape échoue APRÈS que
 *     l'événement a été reçu. generateInvoiceForReservation est idempotente
 *     (contrainte partner_invoices_reservation_uniq + relecture sur conflit) :
 *     un retry après succès partiel ne crée jamais de doublon.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { Resend } from "resend"
import { makeOnFailure } from "@/lib/inngest/on-failure"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"

export const processNetworkConfirmed = inngest.createFunction(
  {
    id: "process-network-confirmed",
    name: "Network B2C confirmé — email récapitulatif",
    triggers: { event: "booking/network.confirmed" },
    onFailure: makeOnFailure("process-network-confirmed"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: Events["booking/network.confirmed"]["data"] }
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const d = event.data

    await step.run("send-network-email", async () => {
      if (!process.env.RESEND_API_KEY) return { skipped: true }
      const resend = new Resend(process.env.RESEND_API_KEY)

      const { error } = await resend.emails.send({
        from: "Easy2Book <reservations@easy2book.tn>",
        to: d.contactEmail,
        subject: `Confirmation réservation ${d.publicRef} — ${d.productName}`,
        html: `
          <h2>Votre réservation est confirmée</h2>
          <p><strong>Référence :</strong> ${d.publicRef}</p>
          <p><strong>Produit :</strong> ${d.productName}</p>
          <p><strong>Quantité :</strong> ${d.quantity}</p>
          <p><strong>Total :</strong> ${d.totalTnd.toLocaleString("fr-FR")} DT</p>
          <hr/>
          <p>Notre équipe vous contactera pour finaliser les détails de votre réservation.</p>
          <p>Easy2Book — Votre partenaire voyage</p>
        `,
      })

      if (error) {
        console.error("[process-network-confirmed] envoi email échoué", {
          reservationId: d.reservationId,
          publicRef: d.publicRef,
          error: error.message,
        })
        return { sent: false, error: error.message }
      }
      return { sent: true }
    })

    // CAS-C — facture garantie via step.run (déplacée depuis
    // lib/network/guest-booking-actions.ts). Idempotente : un retry ne
    // crée jamais de doublon.
    await step.run("generate-invoice", async () => {
      const result = await generateInvoiceForReservation({
        agencyId: d.agencyId,
        reservationId: d.reservationId,
        actorUserId: "",
      })
      if (!result.ok) {
        console.error(
          "[process-network-confirmed] génération facture échouée",
          {
            reservationId: d.reservationId,
            publicRef: d.publicRef,
            error: result.error,
          },
        )
      }
      return result
    })

    return { reservationId: d.reservationId }
  },
)
