/**
 * Synchronisation CRM d'une réservation confirmée — logique testable,
 * découplée du wrapper Inngest (lib/inngest/functions/sync-booking-crm.ts).
 *
 * Même mécanisme d'idempotence + audit que
 * lib/whatsapp/send-booking-confirmation.ts (réutilise `audit_events`,
 * la table d'audit déjà existante — pas une deuxième table/queue) : voir
 * son commentaire de tête pour la justification complète. Aujourd'hui
 * `hasConfiguredCrmProvider()` renvoie toujours `false` (aucun système
 * CRM choisi pour ce projet — voir lib/crm/provider.ts) donc ce module
 * ne fait jamais qu'enregistrer une tentative "ignorée" dans l'audit
 * trail ; il est déjà prêt pour un vrai adaptateur.
 *
 * Garantie architecturale : ce module ne référence, n'importe ni n'écrit
 * JAMAIS `reservations`/`payments`/`wallet_accounts`/`wallet_ledger` —
 * uniquement `audit_events`. Un échec de synchronisation CRM ne peut donc,
 * par construction, jamais changer un statut de réservation ou de
 * paiement. Booking Core reste seul autoritaire.
 */

import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { auditEvents } from "@/lib/db/schema"
import { getCrmProvider, hasConfiguredCrmProvider, type CrmProvider } from "./provider"
import type { NotificationAuditStore } from "@/lib/whatsapp/send-booking-confirmation"
import { pgErrorCode } from "@/lib/db/pg-error"

const ACTION_SYNCED = "notification.crm.synced"
const ACTION_FAILED = "notification.crm.failed"
const ACTION_SKIPPED = "notification.crm.skipped"

export interface SyncBookingCrmInput {
  reservationId: string
  agencyId: string
  publicRef: string
  customerEmail: string
  customerName: string
  customerPhone: string
  totalTnd: number
}

export type SyncBookingCrmOutcome =
  | { outcome: "synced"; providerRecordId?: string }
  | { outcome: "already_synced" }
  | { outcome: "skipped"; reason: "NOT_CONFIGURED" }
  | { outcome: "failed"; code: string; message: string }

export const defaultCrmAuditStore: NotificationAuditStore = {
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
          diff: { channel: "crm", publicRef: input.publicRef, ...diff },
        }),
      )
    } catch (err) {
      // `audit_events_notification_success_uniq` — même garde DB que
      // lib/whatsapp/send-booking-confirmation.ts, voir son commentaire.
      if (pgErrorCode(err) === "23505" && action === ACTION_SYNCED) return
      throw err
    }
  },
}

export async function syncBookingToCrm(
  input: SyncBookingCrmInput,
  deps: { auditStore?: NotificationAuditStore; provider?: CrmProvider; configured?: boolean } = {},
): Promise<SyncBookingCrmOutcome> {
  const auditStore = deps.auditStore ?? defaultCrmAuditStore
  const configured = deps.configured ?? hasConfiguredCrmProvider()
  const provider = deps.provider ?? getCrmProvider()

  const auditIdentity = { agencyId: input.agencyId, reservationId: input.reservationId, publicRef: input.publicRef }

  if (await auditStore.hasAlreadySucceeded(input.reservationId, ACTION_SYNCED)) {
    return { outcome: "already_synced" }
  }

  if (!configured) {
    await auditStore.recordAttempt(auditIdentity, ACTION_SKIPPED, { reason: "NOT_CONFIGURED" })
    return { outcome: "skipped", reason: "NOT_CONFIGURED" }
  }

  const result = await provider.syncBooking({
    reservationId: input.reservationId,
    publicRef: input.publicRef,
    agencyId: input.agencyId,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    totalTnd: input.totalTnd,
    confirmedAt: new Date().toISOString(),
  })

  if (!result.ok) {
    await auditStore.recordAttempt(auditIdentity, ACTION_FAILED, { code: result.code, message: result.message })
    return { outcome: "failed", code: result.code ?? "UNKNOWN", message: result.message ?? "Échec inconnu." }
  }

  await auditStore.recordAttempt(auditIdentity, ACTION_SYNCED, { providerRecordId: result.providerRecordId })
  return { outcome: "synced", providerRecordId: result.providerRecordId }
}

export const CRM_AUDIT_ACTIONS = {
  synced: ACTION_SYNCED,
  failed: ACTION_FAILED,
  skipped: ACTION_SKIPPED,
} as const
