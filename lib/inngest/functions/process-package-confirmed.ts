/**
 * Inngest function — booking/package.confirmed
 *
 * Après confirmation d'une réservation Voyage organisé (Package) :
 *  1. Garantit la facture (idempotent).
 *  2. Envoie l'email récapitulatif au client AU PLUS UNE FOIS par réservation
 *     (OMRA-PACKAGE-NOTIFY-RELIABILITY-01, lib/inngest/send-email-once.ts) ;
 *     une erreur Resend est levée pour déclencher le retry Inngest.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { sendEmailOnce } from "@/lib/inngest/send-email-once"
import { makeOnFailure } from "@/lib/inngest/on-failure"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"

/**
 * Clé d'idempotence de l'email de confirmation voyage organisé
 * (OMRA-PACKAGE-NOTIFY-RELIABILITY-01) : `notification_idempotency` et
 * `audit_events.action` (varchar 32 — ne pas dépasser 32 caractères).
 */
export const PACKAGE_EMAIL_SENT_ACTION = "notification.package_mail.sent"

export const processPackageConfirmed = inngest.createFunction(
  {
    id: "process-package-confirmed",
    name: "Package confirmé — email récapitulatif",
    retries: 3,
    // Une seule exécution à la fois par réservation : deux livraisons
    // simultanées ne peuvent pas passer toutes deux la garde « déjà envoyé ».
    concurrency: { key: "event.data.reservationId", limit: 1 },
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

    // CAS-C — facture garantie via step.run (déplacée depuis packages/booking-actions.ts
    // chemin guest). Idempotente : un retry ne crée jamais de doublon.
    await step.run("generate-invoice", async () => {
      const result = await generateInvoiceForReservation({
        agencyId: d.agencyId,
        reservationId: d.reservationId,
        actorUserId: "",
      })
      if (!result.ok) {
        console.error(
          "[process-package-confirmed] génération facture échouée",
          {
            reservationId: d.reservationId,
            publicRef: d.publicRef,
            error: result.error,
          },
        )
      }
      return result
    })

    // Email EN DERNIER, au plus une fois par réservation : une erreur Resend
    // est levée (retry Inngest) sans rejouer la facture, déjà mémoïsée.
    await step.run("send-package-email", async () =>
      sendEmailOnce({
        action: PACKAGE_EMAIL_SENT_ACTION,
        agencyId: d.agencyId,
        reservationId: d.reservationId,
        publicRef: d.publicRef,
        to: d.contactEmail,
        from: "Easy2Book <voyages@easy2book.tn>",
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
        logTag: "[process-package-confirmed]",
      }),
    )

    return { reservationId: d.reservationId }
  },
)
