/**
 * Envoi WhatsApp de confirmation de réservation — logique testable,
 * découplée du wrapper Inngest
 * (lib/inngest/functions/send-whatsapp-confirmation.ts).
 *
 * Idempotence : réutilise `audit_events` (table existante, déjà le journal
 * d'audit de toute action métier dans ce projet — pas une deuxième table
 * ni une deuxième file d'attente) comme source de vérité pour "un envoi
 * WhatsApp réussi existe-t-il déjà pour cette réservation ?" avant toute
 * tentative — protège contre un double envoi si Inngest relance la
 * fonction après un retry (ex. la requête HTTP vers Meta a réussi côté
 * serveur mais la réponse s'est perdue avant que ce code ne le sache).
 * L'API Cloud de Meta n'expose pas de paramètre d'idempotence côté client
 * pour `/messages` (contrairement à Stripe) — la clé d'idempotence
 * applicative ici est donc `(entityType="reservation", entityId=
 * reservationId, action="notification.whatsapp.sent")`, vérifiée par
 * lecture avant chaque tentative. Chaque tentative (réussie, échouée,
 * ignorée) est elle-même tracée dans `audit_events` — la même table sert
 * donc à la fois de garde d'idempotence et de trace d'audit structurée
 * (exigée pour toute tentative de notification).
 *
 * Garantie architecturale : ce module ne référence, n'importe ni n'écrit
 * JAMAIS `reservations`/`payments`/`wallet_accounts`/`wallet_ledger` —
 * uniquement `audit_events`. Un échec d'envoi WhatsApp ne peut donc, par
 * construction (pas par convention), jamais changer un statut de
 * réservation ou de paiement. Booking Core reste seul autoritaire.
 */

import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { auditEvents } from "@/lib/db/schema"
import { getWhatsAppProvider, type WhatsAppProvider } from "./provider"
import { hasConfiguredWhatsAppProvider } from "./provider"
import { pgErrorCode } from "@/lib/db/pg-error"

const ACTION_SENT = "notification.whatsapp.sent"
const ACTION_FAILED = "notification.whatsapp.failed"
const ACTION_SKIPPED = "notification.whatsapp.skipped"

export interface SendBookingConfirmationWhatsAppInput {
  reservationId: string
  agencyId: string
  publicRef: string
  customerName: string
  customerPhone: string
  hotelName: string
  checkIn: string
  checkOut: string
  totalTnd: number
}

export type SendBookingConfirmationWhatsAppOutcome =
  | { outcome: "sent"; providerMessageId?: string }
  | { outcome: "already_sent" }
  | { outcome: "skipped"; reason: "NOT_CONFIGURED" | "NO_PHONE" }
  | { outcome: "failed"; code: string; message: string }

/**
 * Journal d'audit — interface minimale injectable pour les tests (pas de
 * dépendance DB réelle requise pour tester la logique métier).
 * L'implémentation par défaut passe par `withSystemContext` : ce module
 * tourne en tâche de fond Inngest, sans session utilisateur à résoudre —
 * même justification que les autres appelants "système de confiance" de
 * `withSystemContext` (crons, webhooks déjà vérifiés par secret).
 */
export interface NotificationAuditStore {
  hasAlreadySucceeded(reservationId: string, action: string): Promise<boolean>
  recordAttempt(
    input: { agencyId: string; reservationId: string; publicRef: string },
    action: string,
    diff: Record<string, unknown>,
  ): Promise<void>
}

export const defaultNotificationAuditStore: NotificationAuditStore = {
  async hasAlreadySucceeded(reservationId, action) {
    const [existing] = await withSystemContext((tx) =>
      tx
        .select({ id: auditEvents.id })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.entityType, "reservation"),
            eq(auditEvents.entityId, reservationId),
            eq(auditEvents.action, action),
          ),
        )
        .limit(1),
    )
    return Boolean(existing)
  },
  async recordAttempt(input, action, diff) {
    try {
      await withSystemContext((tx) =>
        tx.insert(auditEvents).values({
          agencyId: input.agencyId,
          entityType: "reservation",
          entityId: input.reservationId,
          action,
          diff: { channel: "whatsapp", publicRef: input.publicRef, ...diff },
        }),
      )
    } catch (err) {
      // `audit_events_notification_success_uniq` (index unique partiel) —
      // garde DB en plus du check `hasAlreadySucceeded` : une course
      // authentiquement concurrente (ex. livraison dupliquée d'événement)
      // peut faire échouer un 2ᵉ INSERT "sent" ici, jamais un vrai double
      // envoi côté client — traité comme un no-op idempotent, pas une erreur.
      if (pgErrorCode(err) === "23505" && action === ACTION_SENT) return
      throw err
    }
  },
}

/** Masque un numéro pour l'audit — ne stocke jamais le PII complet une seconde fois (déjà sur `customers.phone`). */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length <= 4) return "***"
  return `***${digits.slice(-4)}`
}

export async function sendBookingConfirmationWhatsApp(
  input: SendBookingConfirmationWhatsAppInput,
  deps: { auditStore?: NotificationAuditStore; provider?: WhatsAppProvider; configured?: boolean } = {},
): Promise<SendBookingConfirmationWhatsAppOutcome> {
  const auditStore = deps.auditStore ?? defaultNotificationAuditStore
  const configured = deps.configured ?? hasConfiguredWhatsAppProvider()
  const provider = deps.provider ?? getWhatsAppProvider()

  const auditIdentity = { agencyId: input.agencyId, reservationId: input.reservationId, publicRef: input.publicRef }

  // --- Idempotence : ne jamais renvoyer un message déjà confirmé envoyé. ---
  if (await auditStore.hasAlreadySucceeded(input.reservationId, ACTION_SENT)) {
    return { outcome: "already_sent" }
  }

  if (!configured) {
    await auditStore.recordAttempt(auditIdentity, ACTION_SKIPPED, {
      reason: "NOT_CONFIGURED",
      phone: maskPhone(input.customerPhone),
    })
    return { outcome: "skipped", reason: "NOT_CONFIGURED" }
  }
  if (!input.customerPhone) {
    await auditStore.recordAttempt(auditIdentity, ACTION_SKIPPED, { reason: "NO_PHONE" })
    return { outcome: "skipped", reason: "NO_PHONE" }
  }

  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "booking_confirmed"
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANG || "fr"

  const result = await provider.sendTemplateMessage({
    to: input.customerPhone,
    templateName,
    languageCode,
    bodyParams: [
      input.customerName,
      input.publicRef,
      input.hotelName,
      input.checkIn,
      input.checkOut,
      `${input.totalTnd.toLocaleString("fr-FR")} DT`,
    ],
  })

  if (!result.ok) {
    await auditStore.recordAttempt(auditIdentity, ACTION_FAILED, {
      code: result.code,
      message: result.message,
      phone: maskPhone(input.customerPhone),
      templateName,
    })
    return { outcome: "failed", code: result.code ?? "UNKNOWN", message: result.message ?? "Échec inconnu." }
  }

  await auditStore.recordAttempt(auditIdentity, ACTION_SENT, {
    providerMessageId: result.providerMessageId,
    phone: maskPhone(input.customerPhone),
    templateName,
    languageCode,
  })
  return { outcome: "sent", providerMessageId: result.providerMessageId }
}

export const WHATSAPP_AUDIT_ACTIONS = {
  sent: ACTION_SENT,
  failed: ACTION_FAILED,
  skipped: ACTION_SKIPPED,
} as const
