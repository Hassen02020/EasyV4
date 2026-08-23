/**
 * Next.js Instrumentation Hook — exécuté au démarrage du serveur.
 *
 * Phase 20 : `@sentry/nextjs` est maintenant une vraie dépendance
 * (voir package.json) — active Sentry pour les runtimes Node ET Edge,
 * plus `onRequestError` (hook officiel Next.js App Router pour les
 * erreurs de rendu serveur / route handlers qui échappent au code
 * applicatif). Reste défensif par construction (try/catch, jamais de
 * throw) : sans `SENTRY_DSN` configuré, `Sentry.init` n'est jamais
 * appelé et l'app tourne exactement comme avant — l'observabilité ne
 * doit JAMAIS pouvoir casser une réservation/un paiement.
 */

export async function register() {
  if (!process.env.SENTRY_DSN) return

  try {
    if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
      const Sentry = await import("@sentry/nextjs").catch(() => null)
      if (Sentry) {
        Sentry.init({
          dsn: process.env.SENTRY_DSN,
          environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
          tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
          // profilesSampleRate n'est disponible que côté Node (pas Edge).
          ...(process.env.NEXT_RUNTIME === "nodejs" ? { profilesSampleRate: 0.1 } : {}),
        })
      }
    }
  } catch {
    // Sentry non installé/mal configuré — silencieux, comportement inchangé.
  }
}

/**
 * Capture les erreurs de rendu serveur / route handlers (App Router) que
 * les try/catch applicatifs ne voient jamais — ex. une erreur non
 * catchée dans un Server Component. Requis par le SDK Sentry Next.js
 * pour une couverture complète ; sans lui, seules les erreurs explicitement
 * loggées via `logger.error()` (voir lib/logger.ts) remontent.
 */
export async function onRequestError(
  error: unknown,
  request: unknown,
  context: unknown,
): Promise<void> {
  if (!process.env.SENTRY_DSN) return
  try {
    const Sentry = await import("@sentry/nextjs").catch(() => null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- signature imposée par Next.js (voir sa doc onRequestError), pas de type exporté stable à importer ici
    await (Sentry as any)?.captureRequestError?.(error, request, context)
  } catch {
    // Observabilité best-effort — ne jamais faire échouer la requête pour ça.
  }
}
