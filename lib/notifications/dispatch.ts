/**
 * Système de notifications multi-canal — Easy2Book
 *
 * Architecture extensible : chaque canal (`in_app`, `email`, `sms`,
 * `whatsapp`) implémente l'interface `ChannelSender`. Ajouter un canal =
 * enregistrer un sender dans `CHANNEL_SENDERS`, sans toucher aux appelants.
 *
 * - `in_app` : toujours persisté (alimente le badge back-office). Pas d'envoi
 *   externe → statut `sent` immédiat.
 * - canaux sortants (`email` / `sms` / `whatsapp`) : persistés puis envoyés en
 *   best-effort. Si le canal n'est pas configuré (clé API absente), la ligne
 *   est marquée `skipped` — jamais d'échec bloquant pour le flux métier.
 *
 * Les envois externes ne doivent JAMAIS être exécutés dans une transaction DB
 * (I/O réseau). Pour persister une notif in_app à l'intérieur d'une
 * transaction, utiliser `queueInAppNotification(tx, …)`.
 */

import { getDb, type DrizzleTransaction } from "@/lib/db/client"
import { notifications, type NewNotification } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

export type NotificationChannel = "in_app" | "email" | "sms" | "whatsapp"

type DbOrTx = ReturnType<typeof getDb> | DrizzleTransaction

export interface NotificationInput {
  agencyId: string
  /** Type d'événement métier (ex. omra_reservation_created). */
  type: string
  title: string
  body?: string | null
  audience?: "admin" | "customer"
  entityType?: string | null
  entityId?: string | null
  /** Canaux à diffuser. Par défaut : ["in_app"]. */
  channels?: NotificationChannel[]
  /** Destinataire pour les canaux sortants. */
  recipient?: { email?: string | null; phone?: string | null }
  metadata?: Record<string, unknown>
}

/* -------------------------------------------------------------------------- */
/* Channel senders (registry extensible)                                      */
/* -------------------------------------------------------------------------- */

interface OutboundContext {
  recipient: string
  title: string
  body: string | null
}

interface ChannelSender {
  /** Retourne le destinataire (email / téléphone) ou null si absent. */
  resolveRecipient(input: NotificationInput): string | null
  /** Le canal est-il configuré (clés API présentes) ? */
  isConfigured(): boolean
  send(ctx: OutboundContext): Promise<void>
}

const emailSender: ChannelSender = {
  resolveRecipient: (input) => input.recipient?.email?.trim() || null,
  isConfigured: () =>
    Boolean(process.env.RESEND_API_KEY && process.env.NOTIFICATIONS_FROM_EMAIL),
  async send(ctx) {
    const { Resend } = await import("resend")
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: process.env.NOTIFICATIONS_FROM_EMAIL as string,
      to: ctx.recipient,
      subject: ctx.title,
      text: ctx.body ?? ctx.title,
    })
    if (error) throw new Error(error.message)
  },
}

/**
 * Placeholder SMS/WhatsApp (Twilio) — non branché tant que les identifiants ne
 * sont pas fournis. `isConfigured()` renvoie false → la notification est
 * marquée `skipped`. Il suffit d'implémenter `send()` pour activer le canal.
 */
const smsSender: ChannelSender = {
  resolveRecipient: (input) => input.recipient?.phone?.trim() || null,
  isConfigured: () =>
    Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_SMS_FROM,
    ),
  async send() {
    throw new Error("SMS channel not implemented")
  },
}

const whatsappSender: ChannelSender = {
  resolveRecipient: (input) => input.recipient?.phone?.trim() || null,
  isConfigured: () =>
    Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_WHATSAPP_FROM,
    ),
  async send() {
    throw new Error("WhatsApp channel not implemented")
  },
}

const CHANNEL_SENDERS: Record<
  Exclude<NotificationChannel, "in_app">,
  ChannelSender
> = {
  email: emailSender,
  sms: smsSender,
  whatsapp: whatsappSender,
}

/* -------------------------------------------------------------------------- */
/* In-app (persistable dans une transaction)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Persiste une notification `in_app` (badge back-office). Utilisable dans une
 * transaction Drizzle — aucune I/O réseau. Ne lève jamais : une notif ratée ne
 * doit pas faire échouer l'opération métier appelante.
 */
export async function queueInAppNotification(
  dbOrTx: DbOrTx,
  input: NotificationInput,
): Promise<void> {
  try {
    const row: NewNotification = {
      agencyId: input.agencyId,
      channel: "in_app",
      type: input.type,
      audience: input.audience ?? "admin",
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      status: "sent",
      sentAt: new Date(),
      metadata: input.metadata ?? null,
    }
    await dbOrTx.insert(notifications).values(row)
  } catch (err) {
    logger.error("queueInAppNotification failed", {
      type: input.type,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

/* -------------------------------------------------------------------------- */
/* Dispatch multi-canal (hors transaction)                                    */
/* -------------------------------------------------------------------------- */

/**
 * Diffuse une notification sur tous les canaux demandés (par défaut in_app).
 * Best-effort : persiste toujours, envoie les canaux sortants configurés, et
 * ne lève jamais. À appeler APRÈS le commit d'une transaction métier.
 */
export async function dispatchNotification(
  input: NotificationInput,
): Promise<void> {
  if (!process.env.DATABASE_URL) return
  const channels = input.channels ?? ["in_app"]
  const db = getDb()

  for (const channel of channels) {
    if (channel === "in_app") {
      await queueInAppNotification(db, input)
      continue
    }

    const sender = CHANNEL_SENDERS[channel]
    const recipient = sender.resolveRecipient(input)

    // Détermine le statut final avant envoi.
    let status: "sent" | "failed" | "skipped" = "skipped"
    let error: string | null = null
    let sentAt: Date | null = null

    if (!recipient) {
      status = "skipped"
      error = "Destinataire absent"
    } else if (!sender.isConfigured()) {
      status = "skipped"
      error = "Canal non configuré"
    } else {
      try {
        await sender.send({
          recipient,
          title: input.title,
          body: input.body ?? null,
        })
        status = "sent"
        sentAt = new Date()
      } catch (err) {
        status = "failed"
        error = err instanceof Error ? err.message : String(err)
        logger.error("dispatchNotification channel send failed", {
          channel,
          type: input.type,
          err: error,
        })
      }
    }

    try {
      const row: NewNotification = {
        agencyId: input.agencyId,
        channel,
        type: input.type,
        audience: input.audience ?? "customer",
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        recipient,
        status,
        error,
        sentAt,
        metadata: input.metadata ?? null,
      }
      await db.insert(notifications).values(row)
    } catch (err) {
      logger.error("dispatchNotification persist failed", {
        channel,
        type: input.type,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
