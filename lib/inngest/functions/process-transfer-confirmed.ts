/**
 * Inngest function — booking/transfer.confirmed
 *
 * Après confirmation d'un transfert :
 *  1. Envoie email de confirmation au client (Resend).
 *  2. Envoie SMS Twilio au chauffeur assigné si TWILIO_* configuré ET un
 *     chauffeur a déjà été assigné (`reservation_transfer.driver_phone`).
 *
 * Correction : l'étape SMS envoyait auparavant au `customerPhone` en le
 * faisant passer pour un SMS chauffeur (aucune notion de chauffeur assigné
 * n'existait dans le payload de l'événement) — un contenu écrit pour le
 * client, mais avec un libellé d'étape "send-driver-sms" trompeur. Aucun
 * flux d'assignation de chauffeur n'existe encore dans ce projet
 * (driver_assigned_id/driver_phone ne sont écrits nulle part) : cette étape
 * lit désormais le vrai driver_phone et ne fait rien tant qu'il est vide —
 * jamais de substitution silencieuse par un autre destinataire.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { Resend } from "resend"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservationTransfer } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { makeOnFailure } from "@/lib/inngest/on-failure"

export const processTransferConfirmed = inngest.createFunction(
  {
    id: "process-transfer-confirmed",
    name: "Transfert confirmé — notifications",
    triggers: { event: "booking/transfer.confirmed" },
    onFailure: makeOnFailure("process-transfer-confirmed"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: Events["booking/transfer.confirmed"]["data"] }
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const d = event.data

    await step.run("send-client-email", async () => {
      if (!process.env.RESEND_API_KEY || !d.customerEmail) return { skipped: true }
      const resend = new Resend(process.env.RESEND_API_KEY)

      const { error } = await resend.emails.send({
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

      if (error) {
        console.error("[process-transfer-confirmed] envoi email échoué", {
          reservationId: d.reservationId,
          publicRef: d.publicRef,
          error: error.message,
        })
        return { sent: false, error: error.message }
      }
      return { sent: true }
    })

    await step.run("send-driver-sms", async () => {
      if (
        !process.env.TWILIO_ACCOUNT_SID ||
        !process.env.TWILIO_AUTH_TOKEN ||
        !process.env.TWILIO_FROM_NUMBER
      ) {
        return { skipped: true, reason: "twilio_not_configured" }
      }

      const [transfer] = await withSystemContext((db) =>
        db
          .select({ driverPhone: reservationTransfer.driverPhone })
          .from(reservationTransfer)
          .where(eq(reservationTransfer.reservationId, d.reservationId)),
      )

      if (!transfer?.driverPhone) {
        return { skipped: true, reason: "no_driver_assigned" }
      }

      const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`
      const body = new URLSearchParams({
        From: process.env.TWILIO_FROM_NUMBER,
        To: transfer.driverPhone,
        Body: `Nouvelle course Easy2Book ${d.publicRef} : ${d.fromZone}→${d.toZone}, ${new Date(d.pickupAt).toLocaleString("fr-FR")}. Véhicule : ${d.vehicleType}.`,
      })

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      })

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "")
        console.error("[process-transfer-confirmed] envoi SMS chauffeur échoué", {
          reservationId: d.reservationId,
          publicRef: d.publicRef,
          status: response.status,
          errorBody,
        })
        return { sent: false, status: response.status }
      }

      const result = (await response.json().catch(() => null)) as
        | { sid?: string; status?: string }
        | null

      await withSystemContext((db) =>
        db
          .update(reservationTransfer)
          .set({ smsSid: result?.sid ?? null, smsStatus: result?.status ?? null })
          .where(eq(reservationTransfer.reservationId, d.reservationId)),
      )

      return { sent: true, sid: result?.sid }
    })

    return { reservationId: d.reservationId }
  },
)
