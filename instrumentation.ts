/**
 * Next.js Instrumentation Hook — exécuté au démarrage du serveur.
 *
 * Sentry est chargé conditionnellement (pas de crash si le package
 * n'est pas encore installé).
 *
 * Pour activer Sentry :
 *   1. npm install @sentry/nextjs
 *   2. Créer un projet sur sentry.io
 *   3. Ajouter SENTRY_DSN dans .env.local
 *   4. Exécuter npx @sentry/wizard@latest -i nextjs
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      // Sentry désactivé temporairement — package non installé
      // Pour activer : npm install @sentry/nextjs et décommenter ci-dessous
      /*
      const Sentry: any = await import("@sentry/nextjs").catch(() => null)
      if (Sentry && process.env.SENTRY_DSN) {
        Sentry.init({
          dsn: process.env.SENTRY_DSN,
          environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
          tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
          profilesSampleRate: 0.1,
        })
      }
      */
    } catch {
      // Sentry non installé ou erreur — silencieux
    }
  }
}
