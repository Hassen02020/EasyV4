/**
 * Rate limiting — Upstash Redis (production) ou in-memory (dev/CI).
 *
 * Upstash Ratelimit est utilisé si UPSTASH_REDIS_REST_URL est défini.
 * Sinon, fallback sur un sliding window in-memory (1 pod uniquement).
 *
 * Configurable via env :
 *   UPSTASH_REDIS_REST_URL     → active le rate limiting distribué
 *   UPSTASH_REDIS_REST_TOKEN   → token Upstash
 *   RATE_LIMIT_WINDOW_MS       (défaut 60_000 — fallback mémoire uniquement)
 *   RATE_LIMIT_MAX_REQUESTS    (défaut 60)
 */

import { Ratelimit } from "@upstash/ratelimit"
import { getRedis } from "@/lib/cache/redis"

export interface RateLimitResult {
  ok: boolean
  limit: number
  remaining: number
  reset: number // timestamp ms
}

export type RateLimiter = (identifier: string) => Promise<RateLimitResult>

/* -------------------------------------------------------------------------- */
/* Upstash sliding window                                                     */
/* -------------------------------------------------------------------------- */

let _upstashLimiter: Ratelimit | null = null

function getUpstashLimiter(): Ratelimit | null {
  if (_upstashLimiter) return _upstashLimiter
  const redis = getRedis()
  if (!redis) return null
  const maxRequests =
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "", 10) || 60
  _upstashLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, "60 s"),
    analytics: true,
    prefix: "e2b:rl",
  })
  return _upstashLimiter
}

/* -------------------------------------------------------------------------- */
/* In-memory fallback (dev / CI — 1 instance uniquement)                     */
/* -------------------------------------------------------------------------- */

interface Bucket { count: number; reset: number }
const store = new Map<string, Bucket>()

function cleanup() {
  const now = Date.now()
  for (const [key, bucket] of store) {
    if (bucket.reset <= now) store.delete(key)
  }
}

export function createMemoryRateLimiter(
  windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "", 10) || 60_000,
  maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "", 10) || 60,
): RateLimiter {
  return async (identifier: string) => {
    cleanup()
    const now = Date.now()
    const bucket = store.get(identifier)

    if (!bucket || bucket.reset <= now) {
      const reset = now + windowMs
      store.set(identifier, { count: 1, reset })
      return { ok: true, limit: maxRequests, remaining: maxRequests - 1, reset }
    }

    if (bucket.count >= maxRequests) {
      return { ok: false, limit: maxRequests, remaining: 0, reset: bucket.reset }
    }

    bucket.count += 1
    return {
      ok: true,
      limit: maxRequests,
      remaining: maxRequests - bucket.count,
      reset: bucket.reset,
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Default export — auto-sélection Redis / mémoire                           */
/* -------------------------------------------------------------------------- */

const _memLimiter = createMemoryRateLimiter()

/**
 * Rate-limite l'identifiant donné (IP, userId, etc.).
 * Utilise Upstash Redis si configuré, sinon mémoire.
 */
export async function rateLimit(
  identifier: string,
  customLimiter?: RateLimiter,
): Promise<RateLimitResult> {
  if (customLimiter) return customLimiter(identifier)

  const upstash = getUpstashLimiter()
  if (upstash) {
    const { success, limit, remaining, reset } = await upstash.limit(identifier)
    return { ok: success, limit, remaining, reset }
  }

  return _memLimiter(identifier)
}
