/**
 * Client Redis partagé (Upstash) + helpers de cache.
 *
 * Stratégie :
 *  - Si UPSTASH_REDIS_REST_URL est défini → Redis distribué (production).
 *  - Sinon → fallback MemoryCache process-local (dev / CI sans Redis).
 *
 * Exports publics :
 *  - `getRedis()` : client Redis Upstash (lance si absent)
 *  - `memoize(key, ttl, loader)` : get-or-set classique (même API que l'ancien cache.ts)
 *  - `memoizeSWR(key, ttl, loader, opts)` : Stale-While-Revalidate — retourne
 *    la valeur en cache immédiatement et revalide en arrière-plan si le TTL
 *    est dépassé. Idéal pour les catalogues MyGo (villes, boards, tags).
 *  - `invalidate(key)` : supprime une clé (ou préfixe avec `*`).
 */

import { Redis } from "@upstash/redis"

/* -------------------------------------------------------------------------- */
/* Fallback mémoire (dev sans .env)                                           */
/* -------------------------------------------------------------------------- */

interface MemEntry<T> { value: T; expiresAt: number }
const memStore = new Map<string, MemEntry<unknown>>()

const memCache = {
  async get<T>(key: string): Promise<T | null> {
    const e = memStore.get(key)
    if (!e) return null
    if (Date.now() >= e.expiresAt) { memStore.delete(key); return null }
    return e.value as T
  },
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    memStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  },
  async del(key: string): Promise<void> { memStore.delete(key) },
}

/* -------------------------------------------------------------------------- */
/* Singleton Redis                                                             */
/* -------------------------------------------------------------------------- */

let _redis: Redis | null = null

/** Retourne le client Redis Upstash. Null si env vars absentes (→ fallback mémoire). */
export function getRedis(): Redis | null {
  if (_redis) return _redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  _redis = new Redis({ url, token })
  return _redis
}

/* -------------------------------------------------------------------------- */
/* memoize — get-or-set classique                                              */
/* -------------------------------------------------------------------------- */

/**
 * Cache get-or-set. Compatible avec l'ancienne API de lib/mygo/cache.ts.
 * Utilise Redis si disponible, sinon mémoire.
 */
export async function memoize<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const redis = getRedis()

  if (redis) {
    const cached = await redis.get<T>(key)
    if (cached !== null && cached !== undefined) return cached
    const value = await loader()
    await redis.set(key, value, { ex: ttlSeconds })
    return value
  }

  const cached = await memCache.get<T>(key)
  if (cached !== null) return cached
  const value = await loader()
  await memCache.set(key, value, ttlSeconds)
  return value
}

/* -------------------------------------------------------------------------- */
/* withCache — alias ergonomique                                               */
/* -------------------------------------------------------------------------- */

/**
 * withCache<T>(key, ttl, fetcher) — get-or-set générique.
 *
 * Vérifie si `key` existe dans Redis :
 *  - Oui → retourne la donnée cachée immédiatement.
 *  - Non → exécute `fetcher()`, stocke le résultat avec le TTL, retourne la valeur.
 *
 * Fallback automatique sur le cache mémoire si Redis est absent (dev / CI).
 *
 * ```ts
 * const cities = await withCache("mygo:cities", 86_400, () => client.listCities())
 * ```
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  return memoize(key, ttlSeconds, fetcher)
}

/* -------------------------------------------------------------------------- */
/* memoizeSWR — Stale-While-Revalidate                                        */
/* -------------------------------------------------------------------------- */

export interface SWROptions {
  /**
   * Temps en secondes pendant lequel la valeur est considérée "fraîche".
   * Après ce délai, elle est retournée mais une revalidation est déclenchée
   * en arrière-plan (fire-and-forget).
   * Défaut : ttlSeconds / 2
   */
  staleAfterSeconds?: number
}

const SWR_STALE_SUFFIX = ":__stale_at__"

/**
 * Stale-While-Revalidate.
 *
 * Stocke deux clés Redis :
 *  - `key`                → la valeur sérialisée (TTL = ttlSeconds)
 *  - `key:__stale_at__`   → timestamp d'expiration de fraîcheur (TTL = staleAfterSeconds)
 *
 * Si la valeur existe mais que `__stale_at__` a expiré, elle est retournée
 * immédiatement et le loader est appelé en arrière-plan pour rafraîchir.
 */
export async function memoizeSWR<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  opts: SWROptions = {},
): Promise<T> {
  const staleAfter = opts.staleAfterSeconds ?? Math.floor(ttlSeconds / 2)
  const redis = getRedis()

  if (redis) {
    const [cached, staleMarker] = await Promise.all([
      redis.get<T>(key),
      redis.get<string>(key + SWR_STALE_SUFFIX),
    ])

    if (cached !== null && cached !== undefined) {
      if (staleMarker === null) {
        // Valeur présente mais marqueur expiré → revalider en background
        loader()
          .then((fresh) =>
            Promise.all([
              redis.set(key, fresh, { ex: ttlSeconds }),
              redis.set(key + SWR_STALE_SUFFIX, "1", { ex: staleAfter }),
            ]),
          )
          .catch((err) =>
            console.error(`[memoizeSWR] Background revalidation failed for ${key}:`, err),
          )
      }
      return cached
    }

    // Cache miss complet → loader bloquant
    const value = await loader()
    await Promise.all([
      redis.set(key, value, { ex: ttlSeconds }),
      redis.set(key + SWR_STALE_SUFFIX, "1", { ex: staleAfter }),
    ])
    return value
  }

  // Fallback mémoire — simple memoize (pas de SWR en mémoire)
  return memoize(key, ttlSeconds, loader)
}

/* -------------------------------------------------------------------------- */
/* invalidate                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Supprime une clé (ou un pattern `prefix:*`) du cache.
 * En mémoire : suppression directe par clé exacte uniquement.
 */
export async function invalidate(key: string): Promise<void> {
  const redis = getRedis()
  if (redis) {
    if (key.endsWith("*")) {
      const keys = await redis.keys(key)
      if (keys.length > 0) {
        await redis.del(...keys)
      }
    } else {
      await redis.del(key, key + SWR_STALE_SUFFIX)
    }
  } else {
    memStore.delete(key)
  }
}

/** Reset du cache mémoire (tests uniquement). */
export function resetMemCache(): void {
  memStore.clear()
  _redis = null
}
