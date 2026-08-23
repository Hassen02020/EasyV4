/**
 * Point d'entrée UNIQUE pour l'observabilité serveur (Phase 20).
 *
 * `@sentry/nextjs` est un import dynamique volontaire (même motif que
 * `sentry.client.config.ts`/`instrumentation.ts`/`next.config.mjs`,
 * déjà écrits pour tolérer son absence) : si le SDK n'est pas installé
 * ou si `SENTRY_DSN` n'est pas configuré, `captureError` devient un no-op
 * silencieux — jamais un crash, jamais un throw. L'observabilité ne doit
 * JAMAIS pouvoir casser une réservation/un paiement.
 *
 * Intégration principale : `lib/logger.ts::logger.error()` appelle cette
 * fonction pour CHAQUE appel existant à `logger.error(...)` dans le code
 * base (paiement, réservation, DB, etc.) — aucun site d'appel n'a besoin
 * d'être modifié pour bénéficier de la capture Sentry. Utilisée aussi
 * directement par les handlers `onFailure` Inngest (lib/inngest/on-failure.ts)
 * et par `instrumentation.ts::onRequestError`.
 */

export interface ErrorContext {
  reservationId?: string
  agencyId?: string
  userId?: string
  operation?: string
  [key: string]: unknown
}

/** Clés dont la VALEUR ne doit jamais partir vers Sentry, quel que soit le contenu. */
const SENSITIVE_KEY_PATTERN =
  /token|password|secret|apikey|api_key|authorization|cookie|session|hmac|signingkey|signing_key/i

/** Numéro de téléphone probable (8 à 15 chiffres, espaces/tirets/+ tolérés). */
const PHONE_LIKE_PATTERN = /^\+?[\d\s().-]{8,20}$/

/** Exportée pour les tests — voir __tests__/capture-error.test.ts. */
export function scrubValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[REDACTED]"
  if (typeof value === "string") {
    const digitsOnly = value.replace(/\D/g, "")
    if (digitsOnly.length >= 8 && PHONE_LIKE_PATTERN.test(value)) {
      return `[PHONE_REDACTED:…${digitsOnly.slice(-2)}]`
    }
  }
  return value
}

function scrubContext(context?: ErrorContext): Record<string, unknown> | undefined {
  if (!context) return undefined
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    out[key] = scrubValue(key, value)
  }
  return out
}

let sentryModulePromise: Promise<typeof import("@sentry/nextjs") | null> | null = null

function loadSentry() {
  if (!sentryModulePromise) {
    sentryModulePromise = import("@sentry/nextjs").catch(() => null)
  }
  return sentryModulePromise
}

/**
 * Capture une erreur serveur pour l'observabilité — ne lève JAMAIS, ne
 * bloque jamais l'appelant (fire-and-forget). Sans `SENTRY_DSN` configuré
 * (dev local, environnement sans compte Sentry), c'est un no-op silencieux
 * — le comportement métier est strictement inchangé dans les deux cas.
 */
export function captureError(error: unknown, context?: ErrorContext): void {
  if (!process.env.SENTRY_DSN) return

  void loadSentry()
    .then((Sentry) => {
      if (!Sentry) return
      const scrubbed = scrubContext(context)
      Sentry.captureException(error, {
        tags: {
          operation: context?.operation,
          environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
        },
        extra: {
          ...scrubbed,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
      })
    })
    .catch(() => {
      /* observabilité best-effort — ne jamais propager d'échec ici */
    })
}
