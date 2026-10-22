/**
 * Inngest function — booking/mutuelle.confirmed
 *
 * Après confirmation d'une réservation Mutuelle B2B2C :
 *  1. Envoie email récapitulatif au membre.
 *  2. Génère la facture "issued" (CAS-C, fast-path ; MUTUELLE-INVOICE-
 *     SETTLEMENT-01) — déplacé ici depuis l'ancien appel fire-and-forget de
 *     reviewMutuelleRequest (lib/mutuelle/requests-actions.ts) : `step.run`
 *     est persistant côté Inngest, retries automatiques si cette étape
 *     échoue APRÈS que l'événement a été reçu. Utilise délibérément
 *     generateIssuedInvoiceForReservation (status="issued", amountPaid="0")
 *     et non generateInvoiceForReservation ("paid" immédiat) : une
 *     approbation directeur Mutuelle n'est pas une preuve de paiement — voir
 *     MUTUELLE-INVOICE-SETTLEMENT-01. Le passage à "paid" se fait
 *     exclusivement via confirmMutuelleInvoiceSettlement, sur preuve de
 *     règlement réel. generateIssuedInvoiceForReservation est déjà
 *     idempotente au niveau DB (même contrainte partner_invoices_reservation_uniq
 *     + relecture sur conflit) : un retry après succès partiel ne crée
 *     jamais de doublon.
 *
 *     ATTENTION — ce step.run ne couvre PAS la perte de l'événement
 *     lui-même (sendEvent() reste fire-and-forget, hors transaction DB,
 *     sans retry applicatif). La garantie durable réelle contre cette perte
 *     est le cron lib/inngest/functions/recover-mutuelle-missing-invoices.ts,
 *     qui ne dépend d'aucun événement — piloté uniquement par l'état DB.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { Resend } from "resend"
import { makeOnFailure } from "@/lib/inngest/on-failure"
import { generateIssuedInvoiceForReservation } from "@/lib/finance/invoice-actions"

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

    await step.run("generate-mutuelle-invoice", async () => {
      const result = await generateIssuedInvoiceForReservation({
        agencyId: d.agencyId,
        reservationId: d.reservationId,
        actorUserId: d.directorUserId,
      })
      if (!result.ok) {
        console.error(
          "[process-mutuelle-confirmed] génération facture échouée",
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
