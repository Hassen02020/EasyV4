/**
 * Inngest Function — autoConvertLead (CRM-AUTO-CONV-01)
 *
 * Déclenché sur "booking/confirmed". Tente de lier automatiquement
 * la réservation confirmée à un lead existant de la même agence
 * (même email OU même téléphone, statut new/contacted, sans lien existant).
 *
 * Skip silencieux si 0 ou ≥2 leads correspondent (ambiguïté → staff manuel).
 * Idempotent via notification_idempotency(reservationId, 'lead.auto_converted').
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { withTenantContext, withSystemContext } from "@/lib/db/tenant-context"
import { notificationIdempotency, auditEvents } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { autoConvertLeadCore } from "@/lib/crm/leads-core"
import { pgErrorCode } from "@/lib/db/pg-error"
import { makeOnFailure } from "@/lib/inngest/on-failure"

const ACTION = "lead.auto_converted"

export const autoConvertLead = inngest.createFunction(
  {
    id: "auto-convert-lead",
    name: "CRM: conversion automatique lead sur booking/confirmed",
    retries: 3,
    triggers: { event: "booking/confirmed" },
    onFailure: makeOnFailure("auto-convert-lead"),
  },
  async ({
    event,
    step,
  }: {
    event: { data: Events["booking/confirmed"]["data"] }
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> }
  }) => {
    const { reservationId, agencyId, customerEmail, customerPhone } = event.data

    return step.run("auto-convert-lead", async () => {
      // Idempotency guard — permanent, never purged
      const [guard] = await withSystemContext((tx) =>
        tx
          .select({ id: notificationIdempotency.id })
          .from(notificationIdempotency)
          .where(
            and(
              eq(notificationIdempotency.reservationId, reservationId),
              eq(notificationIdempotency.action, ACTION),
            ),
          )
          .limit(1),
      )
      if (guard) return { outcome: "already_done" }

      const result = await withTenantContext(
        { agencyId, userId: "", isSuperAdmin: false },
        (tx) =>
          autoConvertLeadCore(tx, {
            agencyId,
            reservationId,
            customerEmail: customerEmail || null,
            customerPhone: customerPhone || null,
          }),
      )

      if (result.outcome === "converted") {
        // Permanent idempotency guard
        try {
          await withSystemContext((tx) =>
            tx.insert(notificationIdempotency).values({
              agencyId,
              reservationId,
              action: ACTION,
              context: { leadId: result.leadId },
            }),
          )
        } catch (err) {
          if (pgErrorCode(err) === "23505") return { outcome: "already_done" }
          throw err
        }

        // Audit trail (purgé à 30j) — non-bloquant
        await withSystemContext((tx) =>
          tx.insert(auditEvents).values({
            agencyId,
            actorUserId: null,
            entityType: "lead",
            entityId: result.leadId,
            action: ACTION,
            diff: { reservationId },
          }),
        ).catch(() => undefined)
      }

      return result
    })
  },
)
