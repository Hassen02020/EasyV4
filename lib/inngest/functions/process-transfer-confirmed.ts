/**
 * Inngest function — booking/transfer.confirmed
 *
 * Après confirmation d'un transfert :
 *  1. Garantit la facture (idempotent).
 *  2. Envoie SMS Twilio au chauffeur assigné si TWILIO_* configuré ET un
 *     chauffeur a déjà été assigné (`reservation_transfer.driver_phone`).
 *  3. Envoie l'email de confirmation au client (Resend) AU PLUS UNE FOIS par
 *     réservation (TRANSFER-EMAIL-IDEMPOTENCY-01) : un événement rejoué ou un
 *     retry ne renvoie jamais un second email, et une erreur Resend est
 *     LEVÉE pour déclencher le retry Inngest au lieu d'être avalée.
 *
 * L'email est volontairement la DERNIÈRE étape : une panne Resend (qui lève)
 * ne doit pas empêcher la facture ni le SMS, déjà exécutés et mémoïsés par
 * Inngest lors des retries.
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
import {
  auditEvents,
  notificationIdempotency,
  reservationTransfer,
} from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { pgErrorCode } from "@/lib/db/pg-error"
import { formatTransferPickupAt } from "@/lib/transfers/pickup-at"
import { makeOnFailure } from "@/lib/inngest/on-failure"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"

/**
 * Clé d'idempotence de l'email de confirmation transfert. Utilisée telle
 * quelle dans `notification_idempotency` (varchar 64, jamais purgée) ET dans
 * `audit_events.action` (varchar 32 : ne PAS dépasser 32 caractères, sinon
 * l'insertion échoue après l'envoi et provoque un renvoi à chaque retry).
 */
export const TRANSFER_EMAIL_SENT_ACTION = "notification.transfer_mail.sent"

type TransferConfirmedData = Events["booking/transfer.confirmed"]["data"]

export interface TransferEmailDeps {
  hasSent?: (reservationId: string) => Promise<boolean>
  markSent?: (
    agencyId: string,
    reservationId: string,
    publicRef: string,
  ) => Promise<void>
  sendMail?: (mail: {
    to: string
    subject: string
    html: string
  }) => Promise<{ error?: string }>
}

async function hasTransferEmailSent(reservationId: string): Promise<boolean> {
  const [existing] = await withSystemContext((db) =>
    db
      .select({ id: notificationIdempotency.id })
      .from(notificationIdempotency)
      .where(
        and(
          eq(notificationIdempotency.reservationId, reservationId),
          eq(notificationIdempotency.action, TRANSFER_EMAIL_SENT_ACTION),
        ),
      )
      .limit(1),
  )
  return Boolean(existing)
}

/**
 * Enregistre l'envoi. `notification_idempotency` (garde permanente) est écrite
 * EN PREMIER : c'est elle qui empêche le renvoi. La trace d'audit vient
 * ensuite, au mieux : son échec ne doit jamais faire oublier l'envoi.
 */
async function markTransferEmailSent(
  agencyId: string,
  reservationId: string,
  publicRef: string,
): Promise<void> {
  try {
    await withSystemContext((db) =>
      db.insert(notificationIdempotency).values({
        agencyId,
        reservationId,
        action: TRANSFER_EMAIL_SENT_ACTION,
        context: { publicRef },
      }),
    )
  } catch (err) {
    if (pgErrorCode(err) !== "23505") throw err
  }
  try {
    await withSystemContext((db) =>
      db.insert(auditEvents).values({
        agencyId,
        entityType: "reservation",
        entityId: reservationId,
        action: TRANSFER_EMAIL_SENT_ACTION,
        diff: { publicRef },
      }),
    )
  } catch (err) {
    console.error("[process-transfer-confirmed] trace d'audit non écrite", {
      reservationId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function sendMailWithResend(mail: {
  to: string
  subject: string
  html: string
}): Promise<{ error?: string }> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: "Easy2Book <noreply@easy2book.tn>",
    ...mail,
  })
  return error ? { error: error.message } : {}
}

/**
 * Envoie l'email de confirmation au plus une fois par réservation.
 *  - sans adresse ou sans clé Resend : ignoré (comme avant) ;
 *  - déjà envoyé : `alreadySent`, aucun second email ;
 *  - erreur Resend : LEVÉE (retry Inngest) ;
 *  - l'envoi réussi est enregistré ; si l'enregistrement échoue, l'erreur
 *    est journalisée sans lever (l'email est déjà parti).
 */
export async function sendTransferEmailOnce(
  d: TransferConfirmedData,
  deps: TransferEmailDeps = {},
): Promise<
  | { skipped: true; reason: "no_customer_email" | "resend_not_configured" }
  | { alreadySent: true }
  | { sent: true }
> {
  if (!d.customerEmail) return { skipped: true, reason: "no_customer_email" }
  if (!deps.sendMail && !process.env.RESEND_API_KEY) {
    return { skipped: true, reason: "resend_not_configured" }
  }
  const hasSent = deps.hasSent ?? hasTransferEmailSent
  const markSent = deps.markSent ?? markTransferEmailSent
  const sendMail = deps.sendMail ?? sendMailWithResend

  if (await hasSent(d.reservationId)) return { alreadySent: true }

  const { error } = await sendMail({
    to: d.customerEmail,
    subject: `Confirmation transfert ${d.publicRef}`,
    html: `
          <h2>Votre transfert est confirmé !</h2>
          <p><strong>Référence :</strong> ${d.publicRef}</p>
          <p><strong>Trajet :</strong> ${d.fromZone} → ${d.toZone}</p>
          <p><strong>Date & heure :</strong> ${formatTransferPickupAt(d.pickupAt)}</p>
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
      error,
    })
    throw new Error(`Resend error: ${error}`)
  }

  try {
    await markSent(d.agencyId, d.reservationId, d.publicRef)
  } catch (err) {
    console.error(
      "[process-transfer-confirmed] envoi non enregistré — un renvoi est possible",
      {
        reservationId: d.reservationId,
        error: err instanceof Error ? err.message : String(err),
      },
    )
  }
  return { sent: true }
}

export const processTransferConfirmed = inngest.createFunction(
  {
    id: "process-transfer-confirmed",
    name: "Transfert confirmé — notifications",
    retries: 3,
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

    // CAS-C — facture garantie via step.run (déplacée depuis transfers/actions.ts).
    await step.run("generate-invoice", async () => {
      const result = await generateInvoiceForReservation({
        agencyId: d.agencyId,
        reservationId: d.reservationId,
        actorUserId: "",
      })
      if (!result.ok) {
        console.error(
          "[process-transfer-confirmed] génération facture échouée",
          {
            reservationId: d.reservationId,
            publicRef: d.publicRef,
            error: result.error,
          },
        )
      }
      return result
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
        Body: `Nouvelle course Easy2Book ${d.publicRef} : ${d.fromZone}→${d.toZone}, ${formatTransferPickupAt(d.pickupAt)}. Véhicule : ${d.vehicleType}.`,
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
        console.error(
          "[process-transfer-confirmed] envoi SMS chauffeur échoué",
          {
            reservationId: d.reservationId,
            publicRef: d.publicRef,
            status: response.status,
            errorBody,
          },
        )
        return { sent: false, status: response.status }
      }

      const result = (await response.json().catch(() => null)) as {
        sid?: string
        status?: string
      } | null

      await withSystemContext((db) =>
        db
          .update(reservationTransfer)
          .set({
            smsSid: result?.sid ?? null,
            smsStatus: result?.status ?? null,
          })
          .where(eq(reservationTransfer.reservationId, d.reservationId)),
      )

      return { sent: true, sid: result?.sid }
    })

    // Étape email EN DERNIER : une erreur Resend est levée (retry Inngest) et
    // ne doit pas bloquer la facture ni le SMS, déjà mémoïsés.
    await step.run("send-client-email", () => sendTransferEmailOnce(d))

    return { reservationId: d.reservationId }
  },
)
