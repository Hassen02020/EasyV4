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

export function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL
  if (explicit) return explicit.replace(/\/$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT ?? 3000}`
}

/**
 * Paramètres d'infrastructure NON secrets (baseUrl, timeouts, TTLs cache) —
 * partagés par TOUS les comptes MyGo (un seul endpoint myGo, une seule infra
 * de cache par process), quel que soit le compte dont les identifiants sont
 * utilisés. PHASE 27 : extrait de `getMyGoConfig()` pour être réutilisable par
 * `buildMyGoConfigFromAccount()` (lib/hotel-suppliers/mygo/account-config.ts)
 * SANS jamais appeler `getMyGoConfig()` elle-même — celle-ci lève une erreur
 * en mode live si `MYGO_LOGIN`/`MYGO_PASSWORD` globaux sont absents, ce qui
 * serait faux pour un compte tenant qui n'a justement PAS besoin de ces
 * variables d'environnement globales.
 */
export function resolveMyGoInfraDefaults(mode: MyGoMode): Pick<
  MyGoConfig,
  "baseUrl" | "timeoutMs" | "maxRetries" | "staticDataTtlSeconds" | "searchTtlSeconds"
> {
  if (mode === "virtual") {
    return {
      baseUrl: `${siteOrigin()}${VIRTUAL_MYGO_PATH}`,
      timeoutMs: Number(process.env.MYGO_TIMEOUT_MS ?? 8000),
      maxRetries: Number(process.env.MYGO_MAX_RETRIES ?? 3),
      staticDataTtlSeconds: Number(process.env.MYGO_STATIC_TTL_SECONDS ?? 0),
      searchTtlSeconds: Number(process.env.MYGO_SEARCH_TTL_SECONDS ?? 0),
    }
  }
  return {
    baseUrl: process.env.MYGO_API_BASE_URL ?? "https://admin.mygo.co/api/hotel",
    timeoutMs: Number(process.env.MYGO_TIMEOUT_MS ?? 8000),
    maxRetries: Number(process.env.MYGO_MAX_RETRIES ?? 3),
    staticDataTtlSeconds: Number(process.env.MYGO_STATIC_TTL_SECONDS ?? 86400),
    searchTtlSeconds: Number(process.env.MYGO_SEARCH_TTL_SECONDS ?? 300),
  }
}

let cached: MyGoConfig | null = null

/**
 * Lecture lazy de la config (autorise les tests de surcharger via env).
 *
 * `override` — PHASE 27 (multi-tenant supplier accounts) : quand fourni,
 * retourné tel quel, sans toucher au cache ni lire l'environnement — permet
 * à un compte fournisseur MyGo appartenant à une agence (identifiants propres,
 * résolus par `resolveSupplierAccount()`) d'utiliser le même `MyGoClient` que
 * le compte global `MYGO_*`, sans jamais passer par ce cache process-global
 * partagé (qui resterait sinon toujours celui du PREMIER compte résolu dans
 * ce process). Comportement 100% inchangé quand `override` est omis.
 */
export function getMyGoConfig(override?: MyGoConfig): MyGoConfig {
  if (override) return override
  if (cached) return cached
  const mode = resolveMyGoMode()

  if (mode === "virtual") {
    cached = {
      mode,
      // Le Virtual Supplier valide juste la présence de Credential, pas sa
      // valeur réelle — pas besoin de vrais secrets pour tester en local.
      login: process.env.MYGO_LOGIN || "virtual-test-login",
      password: process.env.MYGO_PASSWORD || "virtual-test-password",
      ...resolveMyGoInfraDefaults(mode),
    }
    return cached
  }

  cached = {
    mode,
    login: requireEnv("MYGO_LOGIN"),
    password: requireEnv("MYGO_PASSWORD"),
    ...resolveMyGoInfraDefaults(mode),
  }
  return cached
}

/** Reset du cache de config — uniquement utile en tests. */
export function resetMyGoConfig() {
  cached = null
}
