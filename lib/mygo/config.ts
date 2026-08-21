/**
 * Configuration du client myGo (chargée depuis variables d'environnement).
 *
 * Toutes les requêtes vers l'API myGo passent par ces 3 valeurs.
 * Lire les vraies valeurs sur https://admin.mygo.co/Postman/index.html (URL de test).
 */

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
  baseUrl: string
  login: string
  password: string
  /** Timeout par requête HTTP (ms). Default 15s. */
  timeoutMs: number
  /** Nombre maximum de retries avant échec (réseau / 5xx). */
  maxRetries: number
  /** TTL du cache pour les données statiques (cities, boardings, currencies, tags) en secondes. */
  staticDataTtlSeconds: number
  /** TTL du cache des recherches d'hôtels (court — les prix changent vite) en secondes. */
  searchTtlSeconds: number
}

let cached: MyGoConfig | null = null

/** Lecture lazy de la config (autorise les tests de surcharger via env). */
export function getMyGoConfig(): MyGoConfig {
  if (cached) return cached
  cached = {
    baseUrl: process.env.MYGO_API_BASE_URL ?? "https://admin.mygo.co/api/hotel",
    login: requireEnv("MYGO_LOGIN"),
    password: requireEnv("MYGO_PASSWORD"),
    timeoutMs: Number(process.env.MYGO_TIMEOUT_MS ?? 15000),
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
