/**
 * Cache mémoire process-local avec TTL.
 *
 * Suffisant pour le MVP (Vercel: process partagé sur la même région). Pour scale,
 * brancher Upstash Redis en remplaçant `getCache()` par un client Redis (interface
 * compatible).
 *
 * Note: en dev avec Turbopack, le cache est reset à chaque hot reload — c'est OK.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>()

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  size(): number {
    return this.store.size
  }
}

let shared: MemoryCache | null = null

export function getCache(): MemoryCache {
  if (!shared) shared = new MemoryCache()
  return shared
}

/** Wrapper get-or-set pour les fonctions async (memoization basée sur clé). */
export async function memoize<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cache = getCache()
  const cached = cache.get<T>(key)
  if (cached !== undefined) return cached
  const value = await loader()
  cache.set(key, value, ttlSeconds)
  return value
}

/** Reset — utile en tests. */
export function resetCache() {
  shared = null
}
