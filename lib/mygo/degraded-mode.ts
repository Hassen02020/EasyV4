/**
 * Mode dégradé MyGo — Easy2Book SRE
 *
 * Quand MyGo est indisponible (circuit breaker OPEN), on sert :
 *  1. Le dernier résultat de recherche mis en cache (stale cache).
 *  2. Si pas de cache : une réponse "mode dégradé" avec message utilisateur.
 *  3. Une notification admin via logger.error (capturée par Vercel Log Drain).
 *
 * Clé de stale cache : `e2b:stale:mygo:search:<hash>`  TTL 24h
 *
 * Usage dans la route /api/hotels/search :
 * ```ts
 * const result = await searchWithFallback(input)
 * if (result.degraded) {
 *   // ajouter header X-Degraded-Mode: 1 dans la réponse
 * }
 * ```
 */

import { getRedis } from "@/lib/cache/redis"
import { logger } from "@/lib/logger"
import { metrics } from "@/lib/observability/metrics"
import type { HotelSearchInput } from "./client"

export type DegradedSearchResult<T> = {
  data: T
  degraded: false
  fromStaleCache: boolean
} | {
  data: null
  degraded: true
  reason: "circuit_open" | "timeout" | "upstream_error"
  staleData?: T
  retryAfter?: Date
}

const STALE_TTL_SECONDS = 86_400 // 24h

function staleKey(input: HotelSearchInput): string {
  const hash = stableHash(input)
  return `e2b:stale:mygo:search:${hash}`
}

/**
 * Sauvegarde le résultat d'une recherche réussie en tant que stale cache.
 * Appelé automatiquement après chaque succès MyGo.
 */
export async function saveStaleSearchCache<T>(
  input: HotelSearchInput,
  data: T,
): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(staleKey(input), JSON.stringify(data), { ex: STALE_TTL_SECONDS })
  } catch { /* non-bloquant */ }
}

/**
 * Tente de récupérer le stale cache pour une recherche.
 */
async function getStaleCache<T>(input: HotelSearchInput): Promise<T | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const raw = await redis.get<string>(staleKey(input))
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch { return null }
}

/**
 * Wrapper principal : tente searchHotels(), bascule en mode dégradé si nécessaire.
 */
export async function searchWithFallback<T>(
  input: HotelSearchInput,
  liveSearch: () => Promise<T>,
): Promise<DegradedSearchResult<T>> {
  try {
    const data = await liveSearch()

    // Succès : on sauvegarde en stale cache de manière asynchrone
    void saveStaleSearchCache(input, data)
    void metrics.incr("mygo.degraded_mode.off")

    return { data, degraded: false, fromStaleCache: false }
  } catch (err) {
    const errName = err?.constructor?.name ?? "UnknownError"
    const isCircuitOpen = errName === "MyGoCircuitOpenError"
    const reason: DegradedSearchResult<T> extends { degraded: true } ? never : string =
      isCircuitOpen ? "circuit_open" : "upstream_error"

    // Notification admin via logger (capturée par Vercel Log Drain / Sentry)
    logger.error("[mygo] Mode dégradé activé", {
      reason,
      err: err instanceof Error ? err.message : String(err),
      cityId: input.cityId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
    })

    void metrics.incr("mygo.degraded_mode.on")

    // Tentative de stale cache
    const staleData = await getStaleCache<T>(input)

    if (staleData) {
      logger.warn("[mygo] Stale cache servi à la place de MyGo", {
        cityId: input.cityId,
        reason,
      })
      void metrics.incr("mygo.stale_cache.hit")

      return {
        data: null,
        degraded: true,
        reason: reason as "circuit_open" | "timeout" | "upstream_error",
        staleData,
      }
    }

    void metrics.incr("mygo.stale_cache.miss")

    return {
      data: null,
      degraded: true,
      reason: reason as "circuit_open" | "timeout" | "upstream_error",
    }
  }
}

/** Hash déterministe d'un objet. */
function stableHash(obj: unknown): string {
  const json = JSON.stringify(obj, Object.keys(obj as object).sort())
  let h = 5381
  for (let i = 0; i < json.length; i++) h = (h * 33) ^ json.charCodeAt(i)
  return (h >>> 0).toString(36)
}
