/**
 * Inngest function — booking/omra.confirmed
 *
 * Après confirmation d'une réservation Omra :
 *  1. Garantit la facture (idempotent).
 *  2. Envoie l'email récapitulatif AU PLUS UNE FOIS par réservation
 *     (OMRA-PACKAGE-NOTIFY-RELIABILITY-01, lib/inngest/send-email-once.ts) ;
 *     une erreur Resend est levée pour déclencher le retry Inngest.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { sendEmailOnce } from "@/lib/inngest/send-email-once"
import { makeOnFailure } from "@/lib/inngest/on-failure"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"

/**
 * Clé d'idempotence de l'email de confirmation Omra
 * (OMRA-PACKAGE-NOTIFY-RELIABILITY-01) : `notification_idempotency` et
 * `audit_events.action` (varchar 32 — ne pas dépasser 32 caractères).
 */
export const OMRA_EMAIL_SENT_ACTION = "notification.omra_mail.sent"

export const processOmraConfirmed = inngest.createFunction(
  {
    id: "process-omra-confirmed",
    name: "Omra confirmée — dossier & email",
    retries: 3,
    // Une seule exécution à la fois par réservation : deux livraisons
    // simultanées ne peuvent pas passer toutes deux la garde « déjà envoyé ».
    concurrency: { key: "event.data.reservationId", limit: 1 },
    triggers: { event: "booking/omra.confirmed" },
    onFailure: makeOnFailure("process-omra-confirmed"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: Events["booking/omra.confirmed"]["data"] }
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const d = event.data

    // CAS-C — facture garantie via step.run (déplacée depuis omra/booking-actions.ts).
    await step.run("generate-invoice", async () => {
      const result = await generateInvoiceForReservation({
        agencyId: d.agencyId,
        reservationId: d.reservationId,
        actorUserId: "",
      })
      if (!result.ok) {
        console.error("[process-omra-confirmed] génération facture échouée", {
          reservationId: d.reservationId,
          publicRef: d.publicRef,
          error: result.error,
        })
      }
      return result
    })

    // Email EN DERNIER, au plus une fois par réservation : une erreur Resend
    // est levée (retry Inngest) sans rejouer la facture, déjà mémoïsée.
    await step.run("send-omra-email", async () =>
      sendEmailOnce({
        action: OMRA_EMAIL_SENT_ACTION,
        agencyId: d.agencyId,
        reservationId: d.reservationId,
        publicRef: d.publicRef,
        to: d.contactEmail,
        from: "Easy2Book Omraty <omra@easy2book.tn>",
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
        logTag: "[process-omra-confirmed]",
      }),
    )

    return { reservationId: d.reservationId }
  },
)
