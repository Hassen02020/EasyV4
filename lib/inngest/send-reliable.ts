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
 *  - `id` d'événement stable `nom:reservationId` → déduplication côté Inngest
 *    (fenêtre de 24 h, portée : un même événement pour une même réservation) ;
 *  - 3 tentatives au plus, chacune bornée par un délai (`timeoutMs`), avec
 *    backoff exponentiel : durée maximale ≈ 3 × timeout + 300 ms ;
 *  - en échec définitif : trace DURABLE dans `audit_events`
 *    (`inngest.dispatch_failed`), journal structuré et `captureError` ;
 *  - ne lève JAMAIS : un paiement déjà commité ne doit pas être invalidé par
 *    une panne de notification.
 *
 * CONFIDENTIALITÉ — la charge utile de l'événement n'est JAMAIS persistée,
 * journalisée ni envoyée à Sentry : elle contient l'email et le téléphone du
 * client et, selon le module, le token d'accès à son voucher. La trace ne
 * contient que des données techniques (nom et id d'événement, réservation,
 * agence, nombre de tentatives, présence de la clé Inngest, message d'erreur
 * assaini et tronqué). Un futur rejeu reconstruira la charge utile à partir
 * de la réservation en base, jamais à partir de la trace.
 *
 * Ce module n'effectue AUCUN rejeu automatique. Le rejeu manuel reste interdit
 * tant que les handlers concernés ne sont pas idempotents : voir
 * docs/ops/INNGEST_DISPATCH_FAILURES.md.
 */

import { inngest, type Events } from "@/lib/inngest/client"
import { withSystemContext } from "@/lib/db/tenant-context"
import { auditEvents } from "@/lib/db/schema"
import { captureError } from "@/lib/observability/capture-error"

export const INNGEST_DISPATCH_MAX_ATTEMPTS = 3
export const INNGEST_DISPATCH_RETRY_BASE_MS = 100
/** Délai maximal d'UNE tentative d'envoi (le SDK n'impose aucun délai). */
export const INNGEST_DISPATCH_ATTEMPT_TIMEOUT_MS = 3000
/** Action `audit_events` d'un envoi définitivement échoué (≤ 32 caractères). */
export const INNGEST_DISPATCH_FAILED_ACTION = "inngest.dispatch_failed"
const MAX_ERROR_LENGTH = 300

export type ReliableSendResult =
  | { ok: true; attempts: number; eventId: string }
  | { ok: false; attempts: number; eventId: string; traced: boolean }

/** Données techniques UNIQUEMENT — aucune charge utile d'événement. */
export interface FailedDispatchRecord {
  agencyId: string
  reservationId: string
  eventName: string
  eventId: string
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
  timeoutMs?: number
}

const SENSITIVE_KEY = /email|token|phone|customer/i
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
/** Numéro de téléphone (7 chiffres ou plus, séparateurs tolérés). */
const PHONE_PATTERN = /\+?\d[\d\s.-]{5,}\d/g
/** Jeton opaque : 24 caractères ou plus de [A-Za-z0-9_-]. */
const TOKEN_PATTERN = /[A-Za-z0-9_-]{24,}/g

/**
 * Message d'erreur sûr à persister : retire toute valeur sensible de la
 * charge utile (email, téléphone, token, nom du client) qui aurait été
 * recopiée dans le message, puis tout motif d'email, de numéro de téléphone
 * ou de jeton opaque, et tronque.
 */
export function sanitizeErrorMessage(message: string, data: unknown): string {
  let out = message
  if (data && typeof data === "object") {
    for (const [key, value] of Object.entries(
      data as Record<string, unknown>,
    )) {
      if (
        SENSITIVE_KEY.test(key) &&
        typeof value === "string" &&
        value.length >= 3
      ) {
        out = out.split(value).join("[redacted]")
      }
    }
  }
  // Défense en profondeur : motifs génériques, même si la valeur n'est pas
  // dans la charge utile courante.
  out = out
    .replace(EMAIL_PATTERN, "[email]")
    .replace(PHONE_PATTERN, "[phone]")
    .replace(TOKEN_PATTERN, "[token]")
  return out.length > MAX_ERROR_LENGTH
    ? `${out.slice(0, MAX_ERROR_LENGTH)}…`
    : out
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout après ${ms} ms`)),
      ms,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
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
  const timeoutMs = deps.timeoutMs ?? INNGEST_DISPATCH_ATTEMPT_TIMEOUT_MS

  const eventName = name as string
  const eventId = reliableEventId(eventName, ctx.reservationId)
  let lastError = "unknown"

  for (let attempt = 1; attempt <= INNGEST_DISPATCH_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        await sleep(INNGEST_DISPATCH_RETRY_BASE_MS * 2 ** (attempt - 2))
      }
      await withTimeout(
        Promise.resolve(send({ id: eventId, name: eventName, data })),
        timeoutMs,
      )
      return { ok: true, attempts: attempt, eventId }
    } catch (err) {
      lastError = sanitizeErrorMessage(
        err instanceof Error ? err.message : String(err),
        data,
      )
    }
  }

  const eventKeyConfigured = Boolean(process.env.INNGEST_EVENT_KEY)

  // Échec définitif. Journal structuré : données techniques uniquement.
  console.error(
    JSON.stringify({
      tag: "INNGEST_DISPATCH_FAILURE",
      event: eventName,
      eventId,
      reservationId: ctx.reservationId,
      attempts: INNGEST_DISPATCH_MAX_ATTEMPTS,
      eventKeyConfigured,
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
      error: lastError,
      attempts: INNGEST_DISPATCH_MAX_ATTEMPTS,
      eventKeyConfigured,
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
        error: sanitizeErrorMessage(
          recordErr instanceof Error ? recordErr.message : String(recordErr),
          data,
        ),
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
