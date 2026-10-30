/**
 * Envoi d'un email de confirmation AU PLUS UNE FOIS par réservation et par
 * action (TRANSFER-EMAIL-IDEMPOTENCY-01, généralisé par
 * OMRA-PACKAGE-NOTIFY-RELIABILITY-01).
 *
 *  - sans adresse ou sans clé Resend : ignoré ;
 *  - déjà envoyé : `alreadySent`, aucun second email ;
 *  - erreur Resend : LEVÉE (retry Inngest), jamais avalée ;
 *  - l'envoi réussi est enregistré dans `notification_idempotency` (garde
 *    permanente, écrite en premier) puis tracé dans `audit_events` au mieux ;
 *    si l'enregistrement échoue, l'erreur est journalisée sans lever (l'email
 *    est déjà parti).
 *
 * `action` est utilisée telle quelle dans `audit_events.action` (varchar 32) :
 * ne JAMAIS dépasser 32 caractères (voir CAR-EMAIL-IDEMPOTENCY-01).
 *
 * Le handler qui l'appelle doit déclarer
 * `concurrency: { key: "event.data.reservationId", limit: 1 }` : deux
 * livraisons simultanées ne doivent pas passer toutes deux la garde.
 */

import { Resend } from "resend"
import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { auditEvents, notificationIdempotency } from "@/lib/db/schema"
import { pgErrorCode } from "@/lib/db/pg-error"

export const EMAIL_ACTION_MAX_LENGTH = 32

export interface EmailOnceDeps {
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

export interface EmailOnceInput {
  action: string
  agencyId: string
  reservationId: string
  publicRef: string
  /** Destinataire ; absent → envoi ignoré. */
  to: string | null | undefined
  from: string
  subject: string
  html: string
  /** Préfixe des journaux, ex. "[process-omra-confirmed]". */
  logTag: string
}

export type EmailOnceResult =
  | { skipped: true; reason: "no_customer_email" | "resend_not_configured" }
  | { alreadySent: true }
  | { sent: true }

export async function hasEmailBeenSent(
  action: string,
  reservationId: string,
): Promise<boolean> {
  const [existing] = await withSystemContext((db) =>
    db
      .select({ id: notificationIdempotency.id })
      .from(notificationIdempotency)
      .where(
        and(
          eq(notificationIdempotency.reservationId, reservationId),
          eq(notificationIdempotency.action, action),
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
export async function markEmailSent(
  action: string,
  agencyId: string,
  reservationId: string,
  publicRef: string,
  logTag = "[send-email-once]",
): Promise<void> {
  try {
    await withSystemContext((db) =>
      db.insert(notificationIdempotency).values({
        agencyId,
        reservationId,
        action,
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
        action,
        diff: { publicRef },
      }),
    )
  } catch (err) {
    console.error(`${logTag} trace d'audit non écrite`, {
      reservationId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function resendSender(from: string) {
  return async (mail: {
    to: string
    subject: string
    html: string
  }): Promise<{ error?: string }> => {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({ from, ...mail })
    return error ? { error: error.message } : {}
  }
}

export async function sendEmailOnce(
  input: EmailOnceInput,
  deps: EmailOnceDeps = {},
): Promise<EmailOnceResult> {
  if (input.action.length > EMAIL_ACTION_MAX_LENGTH) {
    // Erreur de programmation : l'enregistrement échouerait APRÈS l'envoi.
    throw new Error(
      `action trop longue (${input.action.length} > ${EMAIL_ACTION_MAX_LENGTH}) : ${input.action}`,
    )
  }
  if (!input.to) return { skipped: true, reason: "no_customer_email" }
  if (!deps.sendMail && !process.env.RESEND_API_KEY) {
    return { skipped: true, reason: "resend_not_configured" }
  }
  const hasSent =
    deps.hasSent ?? ((id: string) => hasEmailBeenSent(input.action, id))
  const markSent =
    deps.markSent ??
    ((agencyId: string, reservationId: string, publicRef: string) =>
      markEmailSent(
        input.action,
        agencyId,
        reservationId,
        publicRef,
        input.logTag,
      ))
  const sendMail = deps.sendMail ?? resendSender(input.from)

  if (await hasSent(input.reservationId)) return { alreadySent: true }

  const { error } = await sendMail({
    to: input.to,
    subject: input.subject,
    html: input.html,
  })
  if (error) {
    console.error(`${input.logTag} envoi email échoué`, {
      reservationId: input.reservationId,
      publicRef: input.publicRef,
      error,
    })
    throw new Error(`Resend error: ${error}`)
  }

  try {
    await markSent(input.agencyId, input.reservationId, input.publicRef)
  } catch (err) {
    console.error(
      `${input.logTag} envoi non enregistré — un renvoi est possible`,
      {
        reservationId: input.reservationId,
        error: err instanceof Error ? err.message : String(err),
      },
    )
  }
  return { sent: true }
}
