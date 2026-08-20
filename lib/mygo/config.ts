/**
 * Configuration du client myGo (chargée depuis variables d'environnement).
 *
 * Toutes les requêtes vers l'API myGo passent par ces 3 valeurs.
 * Lire les vraies valeurs sur https://admin.mygo.co/Postman/index.html (URL de test).
 *
 * MYGO_MODE — garde-fou explicite (voir lib/mygo/virtual-supplier/) :
 *   - "live"    (défaut) : baseUrl = MYGO_API_BASE_URL ou l'endpoint réel myGo.
 *   - "virtual" : baseUrl est FORCÉE vers le Virtual MyGo Supplier local,
 *     quelle que soit la valeur de MYGO_API_BASE_URL — aucune requête ne peut
 *     atteindre admin.mygo.co par erreur de config en mode virtuel. C'est le
 *     serveur qui décide du mode, jamais le frontend (aucune valeur MYGO_MODE
 *     n'est exposée en NEXT_PUBLIC_*).
 */

export type MyGoMode = "live" | "virtual"

const requireEnv = (name: string): string => {
  const v = process.env[name]
  if (!v || v.length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in .env.local (dev) or your deployment provider (prod).`,
    )
  }
  return v
}

export interface MyGoConfig {
  mode: MyGoMode
  baseUrl: string
  login: string
  password: string
  /** Timeout par requête HTTP (ms). Default 8s. */
  timeoutMs: number
  /** Nombre maximum de retries avant échec (réseau / 5xx). */
  maxRetries: number
  /** TTL du cache pour les données statiques (cities, boardings, currencies, tags) en secondes. */
  staticDataTtlSeconds: number
  /** TTL du cache des recherches d'hôtels (court — les prix changent vite) en secondes. */
  searchTtlSeconds: number
}

/** Endpoint interne du Virtual MyGo Supplier — jamais un hôte externe. */
export const VIRTUAL_MYGO_PATH = "/api/virtual-mygo"

function resolveMyGoMode(): MyGoMode {
  return process.env.MYGO_MODE === "virtual" ? "virtual" : "live"
}

function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL
  if (explicit) return explicit.replace(/\/$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT ?? 3000}`
}

let cached: MyGoConfig | null = null

/** Lecture lazy de la config (autorise les tests de surcharger via env). */
export function getMyGoConfig(): MyGoConfig {
  if (cached) return cached
  const mode = resolveMyGoMode()

  if (mode === "virtual") {
    cached = {
      mode,
      // Forcée — MYGO_API_BASE_URL est IGNORÉE en mode virtuel par design :
      // une mauvaise config ne doit jamais pouvoir router vers le vrai myGo.
      baseUrl: `${siteOrigin()}${VIRTUAL_MYGO_PATH}`,
      // Le Virtual Supplier valide juste la présence de Credential, pas sa
      // valeur réelle — pas besoin de vrais secrets pour tester en local.
      login: process.env.MYGO_LOGIN || "virtual-test-login",
      password: process.env.MYGO_PASSWORD || "virtual-test-password",
      timeoutMs: Number(process.env.MYGO_TIMEOUT_MS ?? 8000),
      maxRetries: Number(process.env.MYGO_MAX_RETRIES ?? 3),
      staticDataTtlSeconds: Number(process.env.MYGO_STATIC_TTL_SECONDS ?? 0),
      searchTtlSeconds: Number(process.env.MYGO_SEARCH_TTL_SECONDS ?? 0),
    }
    return cached
  }

  cached = {
    mode,
    baseUrl: process.env.MYGO_API_BASE_URL ?? "https://admin.mygo.co/api/hotel",
    login: requireEnv("MYGO_LOGIN"),
    password: requireEnv("MYGO_PASSWORD"),
    timeoutMs: Number(process.env.MYGO_TIMEOUT_MS ?? 8000),
    maxRetries: Number(process.env.MYGO_MAX_RETRIES ?? 3),
    staticDataTtlSeconds: Number(process.env.MYGO_STATIC_TTL_SECONDS ?? 86400),
    searchTtlSeconds: Number(process.env.MYGO_SEARCH_TTL_SECONDS ?? 300),
  }
  return cached
}

/** Reset du cache de config — uniquement utile en tests. */
export function resetMyGoConfig() {
  cached = null
}
