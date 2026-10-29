/**
 * Émission fiable d'un événement Inngest (INNGEST-RELIABILITY-01).
 *
 * Problème : après un paiement manuel, la réservation et le paiement sont
 * commités AVANT l'envoi de l'événement de confirmation. Les sites d'appel
 * faisaient `sendEvent(...).catch(() => {})` : si Inngest est indisponible ou
 * non configuré, l'événement est perdu sans aucune trace.
 *
 * Ce module reprend le modèle déjà éprouvé pour le vol
 * (lib/vols/fulfillment-action.ts, G13) et le complète :
 *  - `id` d'événement stable → déduplication côté Inngest (fenêtre 24 h) ;
 *  - 3 tentatives avec backoff exponentiel ;
 *  - en échec définitif : trace DURABLE dans `audit_events`
 *    (`inngest.dispatch_failed`, charge utile complète pour un rejeu), journal
 *    structuré SANS charge utile (elle contient l'email et parfois le token
 *    d'accès du client) et `captureError` ;
 *  - ne lève JAMAIS : un paiement déjà commité ne doit pas être invalidé par
 *    une panne de notification.
 *
 * Ce module n'effectue AUCUNE relecture automatique : celle-ci attend que les
 * handlers soient idempotents (sinon un rejeu peut doubler les emails).
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { withSystemContext } from "@/lib/db/tenant-context"
import { auditEvents } from "@/lib/db/schema"
import { captureError } from "@/lib/observability/capture-error"

export const INNGEST_DISPATCH_MAX_ATTEMPTS = 3
export const INNGEST_DISPATCH_RETRY_BASE_MS = 100
/** Action `audit_events` d'un envoi définitivement échoué (≤ 32 caractères). */
export const INNGEST_DISPATCH_FAILED_ACTION = "inngest.dispatch_failed"

export type ReliableSendResult =
  | { ok: true; attempts: number; eventId: string }
  | { ok: false; attempts: number; eventId: string; traced: boolean }

export interface FailedDispatchRecord {
  agencyId: string
  reservationId: string
  eventName: string
  eventId: string
  payload: unknown
  error: string
  attempts: number
  eventKeyConfigured: boolean
  failedAt: string
}

/** Dépendances injectables (tests) ; les valeurs par défaut sont celles de production. */
export interface ReliableSendDeps {
  send?: (event: {
    id: string
    name: string
    data: unknown
  }) => Promise<unknown>
  sleep?: (ms: number) => Promise<void>
  record?: (record: FailedDispatchRecord) => Promise<void>
}

async function recordFailureInAudit(
  record: FailedDispatchRecord,
): Promise<void> {
  await withSystemContext((db) =>
    db.insert(auditEvents).values({
      agencyId: record.agencyId,
      entityType: "reservation",
      entityId: record.reservationId,
      action: INNGEST_DISPATCH_FAILED_ACTION,
      diff: {
        eventName: record.eventName,
        eventId: record.eventId,
        payload: record.payload,
        error: record.error,
        attempts: record.attempts,
        eventKeyConfigured: record.eventKeyConfigured,
        failedAt: record.failedAt,
      },
    }),
  )
}

export function reliableEventId(name: string, reservationId: string): string {
  return `${name}:${reservationId}`
}

/**
 * Envoie `name` avec `data`. `reservationId` et `agencyId` servent à la
 * déduplication (id d'événement) et à la trace d'un échec.
 */
export async function sendEventReliable<K extends keyof Events>(
  name: K,
  data: Events[K]["data"],
  ctx: { reservationId: string; agencyId: string },
  deps: ReliableSendDeps = {},
): Promise<ReliableSendResult> {
  const send =
    deps.send ??
    ((event: { id: string; name: string; data: unknown }) =>
      inngest.send(event as unknown as Parameters<typeof inngest.send>[0]))
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const record = deps.record ?? recordFailureInAudit

  const eventName = name as string
  const eventId = reliableEventId(eventName, ctx.reservationId)
  let lastError = "unknown"

  for (let attempt = 1; attempt <= INNGEST_DISPATCH_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        await sleep(INNGEST_DISPATCH_RETRY_BASE_MS * 2 ** (attempt - 2))
      }
      await send({ id: eventId, name: eventName, data })
      return { ok: true, attempts: attempt, eventId }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  // Échec définitif. Journal structuré SANS charge utile (email, token).
  console.error(
    JSON.stringify({
      tag: "INNGEST_DISPATCH_FAILURE",
      event: eventName,
      eventId,
      reservationId: ctx.reservationId,
      attempts: INNGEST_DISPATCH_MAX_ATTEMPTS,
      eventKeyConfigured: Boolean(process.env.INNGEST_EVENT_KEY),
      error: lastError,
      ts: new Date().toISOString(),
    }),
  )
  captureError(new Error(`inngest dispatch failed: ${eventName}`), {
    operation: "inngest:dispatch",
    reservationId: ctx.reservationId,
    agencyId: ctx.agencyId,
    eventName,
    error: lastError,
  })

  let traced = false
  try {
    await record({
      agencyId: ctx.agencyId,
      reservationId: ctx.reservationId,
      eventName,
      eventId,
      payload: data,
      error: lastError,
      attempts: INNGEST_DISPATCH_MAX_ATTEMPTS,
      eventKeyConfigured: Boolean(process.env.INNGEST_EVENT_KEY),
      failedAt: new Date().toISOString(),
    })
    traced = true
  } catch (recordErr) {
    // La trace durable elle-même a échoué : le journal ci-dessus reste le
    // dernier recours. Jamais d'exception vers l'appelant.
    console.error(
      JSON.stringify({
        tag: "INNGEST_DISPATCH_TRACE_FAILURE",
        event: eventName,
        eventId,
        reservationId: ctx.reservationId,
        error:
          recordErr instanceof Error ? recordErr.message : String(recordErr),
        ts: new Date().toISOString(),
      }),
    )
  }

  return {
    ok: false,
    attempts: INNGEST_DISPATCH_MAX_ATTEMPTS,
    eventId,
    traced,
  }
}
