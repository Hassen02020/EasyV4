/**
 * Garde d'idempotence pour le tunnel guest checkout B2C (Phase 12).
 *
 * Extrait de `guest-actions.ts` dans son propre module volontairement léger
 * (une seule dépendance : `getRedis`) pour rester testable en isolation sous
 * le runner `node --test` sans tirer la chaîne d'imports serveur complète
 * (`actions.ts` → `lib/pro/server-context.ts` → `import "server-only"`, un
 * garde-fou Next.js absent du runtime de test). Même contrat que le
 * `redisOverride` de `debitPartnerCredit` (Phase 11,
 * `lib/pro/booking-actions.ts`) : dégradation gracieuse si Redis est
 * indisponible (`run()` s'exécute simplement à chaque appel, sans cache).
 *
 * PAY-IDEM-DB-01 — dbFallback (optionnel) : quand Redis est absent,
 * l'appelant peut fournir une vérification DB qui retrouve une réservation
 * déjà créée pour cette clé, AVANT d'appeler run(). Sans ce fallback, le
 * comportement préexistant est conservé (run() exécuté directement — la
 * contrainte unique DB `reservations_guest_idempotency_uniq` reste le
 * garde-fou financier final).
 */

import { getRedis } from "@/lib/cache/redis"

export interface GuestIdempotencyRedis {
  get: <T>(key: string) => Promise<T | null>
  set: (key: string, value: string, opts?: { ex: number }) => Promise<unknown>
}

export async function withGuestIdempotency<T>(
  idempotencyKey: string,
  run: () => Promise<T>,
  redisOverride?: GuestIdempotencyRedis,
  dbFallback?: () => Promise<T | null>,
): Promise<T> {
  const redis = redisOverride ?? getRedis()
  const cacheKey = `e2b:idem:guest-booking:${idempotencyKey}`
  if (redis) {
    const cached = await redis.get<string>(cacheKey)
    if (cached) {
      try {
        return JSON.parse(cached) as T
      } catch {
        // Cache corrompu — on relance normalement.
      }
    }
  } else if (dbFallback) {
    // Redis absent — DB fallback pour retrouver une réservation déjà créée
    // avant tout appel fournisseur externe ou tentative d'INSERT dupliqué.
    const existing = await dbFallback()
    if (existing !== null) return existing
  }
  const result = await run()
  if (redis) {
    await redis.set(cacheKey, JSON.stringify(result), { ex: 3600 })
  }
  return result
}
