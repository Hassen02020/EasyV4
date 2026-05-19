/**
 * Rate limiting — sliding window in-memory.
 *
 * En production, remplacez l'implémentation par Upstash Redis
 * (`@upstash/ratelimit`) en branchant `createRedisRateLimiter()`.
 * La signature publique reste identique.
 *
 * Configurable via env :
 *   RATE_LIMIT_WINDOW_MS   (défaut 60_000)
 *   RATE_LIMIT_MAX_REQUESTS (défaut 60)
 */

export interface RateLimitResult {
  ok: boolean
  limit: number
  remaining: number
  reset: number // timestamp ms
}

export type RateLimiter = (identifier: string) => Promise<RateLimitResult>

/* -------------------------------------------------------------------------- */
/* In-memory sliding window (dégradé, 1 instance Node → pas global multi-pod)  */
/* -------------------------------------------------------------------------- */

interface Bucket {
  count: number
  reset: number
}

const store = new Map<string, Bucket>()

function cleanup() {
  const now = Date.now()
  for (const [key, bucket] of store) {
    if (bucket.reset <= now) store.delete(key)
  }
}

export function createMemoryRateLimiter(
  windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "", 10) || 60_000,
  maxRequests =
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "", 10) || 60,
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
      return {
        ok: false,
        limit: maxRequests,
        remaining: 0,
        reset: bucket.reset,
      }
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
/* Default singleton                                                          */
/* -------------------------------------------------------------------------- */

const defaultLimiter = createMemoryRateLimiter()

export async function rateLimit(
  identifier: string,
  customLimiter?: RateLimiter,
): Promise<RateLimitResult> {
  return (customLimiter ?? defaultLimiter)(identifier)
}
