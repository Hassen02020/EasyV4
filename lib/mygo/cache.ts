/**
 * Cache myGo — délègue à lib/cache/redis.ts.
 *
 * Utilise Redis Upstash si UPSTASH_REDIS_REST_URL est défini,
 * sinon fallback sur le cache mémoire process-local (dev / CI).
 *
 * API publique inchangée pour ne pas casser les consommateurs existants.
 */

export {
  memoize,
  memoizeSWR,
  invalidate,
  resetMemCache as resetCache,
} from "@/lib/cache/redis"
