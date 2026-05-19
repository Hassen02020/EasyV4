/**
 * Sentry client-side config.
 *
 * Chargé automatiquement par @sentry/nextjs côté navigateur.
 */

try {
  const Sentry = require("@sentry/nextjs")
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
  })
} catch {
  // Sentry non installé — silencieux
}
