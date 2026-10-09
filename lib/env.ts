/**
 * ENV-VALIDATION-01 — Validation des variables d'environnement au démarrage.
 *
 * Valide les variables critiques avec zod au démarrage du serveur Node.js.
 * Invoqué depuis instrumentation.ts (register()) — runtime Node uniquement,
 * jamais depuis le Edge Runtime (proxy.ts).
 *
 * Deux niveaux :
 *  - CRITIQUE : absence = throw immédiat, app ne démarre pas.
 *  - AVERTISSEMENT : absence = warning en console, fonctionnalité dégradée.
 *
 * Valeurs par défaut dangereuses : en production, les secrets avec valeur
 * d'exemple sont rejetés (PRICE_TOKEN_SECRET, SUPPLIER_CREDENTIALS_ENCRYPTION_KEY,
 * CRON_SECRET). En dev/test, ils sont acceptés avec un warning.
 */

import { z } from "zod"

/* -------------------------------------------------------------------------- */
/* Schéma critique — toute valeur manquante empêche le démarrage               */
/* -------------------------------------------------------------------------- */

const criticalSchema = z.object({
  // Base de données
  DATABASE_URL: z.string().min(1),

  // Supabase Auth + Storage
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Secrets sécurité — longeur minimum 16 chars
  PRICE_TOKEN_SECRET: z.string().min(16),
  SUPPLIER_CREDENTIALS_ENCRYPTION_KEY: z.string().min(16),
  CRON_SECRET: z.string().min(16),
})

/* -------------------------------------------------------------------------- */
/* Valeurs d'exemple interdites en production                                  */
/* -------------------------------------------------------------------------- */

const DANGEROUS_DEFAULT_SECRETS: Record<string, string> = {
  PRICE_TOKEN_SECRET: "price-token-dev-secret-not-for-prod",
  SUPPLIER_CREDENTIALS_ENCRYPTION_KEY: "changeme-use-openssl-rand-hex-32",
  CRON_SECRET: "changeme-use-random-64-chars",
}

/* -------------------------------------------------------------------------- */
/* Schéma d'avertissement — absent = dégradé, jamais bloquant                  */
/* -------------------------------------------------------------------------- */

const warnSchema = z.object({
  EXCHANGE_RATE_API_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
})

const WARN_MESSAGES: Record<string, string> = {
  EXCHANGE_RATE_API_KEY:
    "Taux de change inopérant — toute conversion devise lèvera ExchangeRateUnavailableError (fail-closed). Obtenir une clé : https://www.exchangerate-api.com/",
  RESEND_API_KEY:
    "Emails transactionnels désactivés — confirmations booking, vouchers et factures non envoyés.",
  INNGEST_SIGNING_KEY:
    "Inngest désactivé — background jobs (relances CRM, reconciliation) ne s'exécutent pas.",
  INNGEST_EVENT_KEY:
    "Inngest désactivé — background jobs (relances CRM, reconciliation) ne s'exécutent pas.",
}

/* -------------------------------------------------------------------------- */
/* Point d'entrée                                                               */
/* -------------------------------------------------------------------------- */

export function validateEnv(): void {
  const isProduction = process.env.NODE_ENV === "production"
  const errors: string[] = []
  const warnings: string[] = []

  // --- Variables critiques ---
  const parsed = criticalSchema.safeParse(process.env)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".")
      errors.push(`  ✗ ${key} : ${issue.message}`)
    }
  }

  // --- Secrets dangereux en production ---
  if (isProduction) {
    for (const [key, dangerousValue] of Object.entries(
      DANGEROUS_DEFAULT_SECRETS,
    )) {
      if (process.env[key] === dangerousValue) {
        errors.push(
          `  ✗ ${key} : valeur d'exemple non remplacée en production (utiliser openssl rand -hex 32)`,
        )
      }
    }
  }

  // --- Variables d'avertissement ---
  const parsedWarn = warnSchema.safeParse(process.env)
  if (parsedWarn.success) {
    for (const [key, msg] of Object.entries(WARN_MESSAGES)) {
      if (!process.env[key]) {
        warnings.push(`  ⚠ ${key} : ${msg}`)
      }
    }
  }

  // --- Rapport warnings ---
  if (warnings.length > 0) {
    console.warn(
      `[env] Fonctionnalités dégradées (variables optionnelles absentes) :\n${warnings.join("\n")}`,
    )
  }

  // --- Rapport erreurs + throw ---
  if (errors.length > 0) {
    const msg = [
      `[env] DÉMARRAGE REFUSÉ — ${errors.length} variable(s) d'environnement critique(s) manquante(s) ou invalide(s) :`,
      ...errors,
      ``,
      `  → Compléter .env.local (dev) ou les variables d'environnement Vercel (prod).`,
    ].join("\n")
    throw new Error(msg)
  }
}
