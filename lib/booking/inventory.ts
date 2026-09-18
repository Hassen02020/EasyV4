/**
 * Inventory Engine — Easy2Book
 *
 * Gère le verrouillage des offres pendant le tunnel de réservation.
 * Un "lock" empêche deux agents de réserver la même offre simultanément,
 * ET empêche deux requêtes concurrentes d'appeler deux fois le fournisseur
 * pour la même offre (voir lib/booking/guest-actions.ts,
 * lib/hotels-monde/guest-booking-actions.ts, lib/vols/guest-booking-actions.ts
 * — les 3 seuls appelants réels, tunnels "supplier-backed" où la
 * réservation fournisseur précède la persistance locale).
 *
 * Stratégie :
 *  - Redis (Upstash) est l'UNIQUE mécanisme d'exclusivité réelle : TTL 10 min,
 *    atomique via SET NX EX. Clé canonique tenant-scoped :
 *    `e2b:lock:<agencyId>:<module>:<itemId>` → valeur = sessionId.
 *    `agencyId` vient TOUJOURS du contexte serveur déjà résolu par l'appelant
 *    (`getDefaultAgencyId()` pour le guest checkout), jamais d'une valeur
 *    cliente — aucune nouvelle résolution introduite ici.
 *  - FAIL-CLOSED explicite : si Redis n'est pas configuré
 *    (`UPSTASH_REDIS_REST_URL`/`_TOKEN` absents), `acquireLock()` et
 *    `refreshLock()` renvoient `{ ok: false, reason: "redis_unavailable" }`
 *    plutôt que de prétendre avoir posé un verrou qui n'existe pas — un
 *    environnement sans Redis provisionné NE DOIT PAS pouvoir continuer un
 *    tunnel de réservation "supplier-backed" sans protection réelle contre
 *    la concurrence. `releaseLock()` reste best-effort (libérer est toujours
 *    sûr à tenter, même sans Redis il n'y a alors rien à libérer).
 *  - Postgres (`inventory_locks`) reste une trace AUDIT seule (comptabilité/
 *    monitoring, jamais consultée pour la décision d'exclusivité).
 *
 * API publique :
 *  - `acquireLock(input)`   : tente de poser un verrou → ok | conflict | redis_unavailable | error
 *  - `releaseLock(input)`   : libère le verrou (confirmation ou abandon)
 *  - `refreshLock(input)`   : repousse l'expiration (keep-alive tunnel)
 *  - `checkLock(input)`     : vérifie si une session détient le verrou (lecture seule, avec repli DB)
 *  - `cleanExpiredLocks()`  : Cron job — marque les locks DB expirés
 */

"use server"

import { eq, and, lt } from "drizzle-orm"
import { logger } from "@/lib/logger"
import { metrics } from "@/lib/observability/metrics"
import { getRedis } from "@/lib/cache/redis"
import { withSystemContext } from "@/lib/db/tenant-context"
import { inventoryLocks, type NewInventoryLock } from "@/lib/db/schema"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCK_TTL_SECONDS = 600 // 10 minutes
const LOCK_REFRESH_SECONDS = 300 // 5 minutes de plus si keep-alive

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LockModule =
  | "hotel"
  | "hotel_monde"
  | "flight"
  | "omra"
  | "package"
  | "transfer"
  | "car"

export interface AcquireLockInput {
  agencyId: string
  sessionId: string
  module: LockModule
  /** Token myGo, UUID package, etc. */
  itemId: string
  /** Prix TND figé au moment du lock. */
  priceTnd?: number
}

export interface ReleaseLockInput {
  agencyId: string
  sessionId: string
  module: LockModule
  itemId: string
  /** Si fourni, marque le lock comme "confirmed" plutôt que "released". */
  reservationId?: string
}

export type LockResult =
  | { ok: true; expiresAt: Date; lockKey: string }
  | { ok: false; reason: "conflict" | "redis_unavailable" | "error"; message: string }

/**
 * Même contrat que `GuestIdempotencyRedis` (lib/booking/guest-idempotency.ts)
 * — injection pour les tests (`node --test` sans Upstash réel), jamais
 * utilisée en dehors de `__tests__`. Comportement par défaut (`getRedis()`)
 * inchangé quand omis.
 */
export interface InventoryRedis {
  get: <T>(key: string) => Promise<T | null>
  set: (key: string, value: string, opts?: { ex?: number; nx?: boolean }) => Promise<unknown>
  expire: (key: string, seconds: number) => Promise<unknown>
  del: (key: string) => Promise<unknown>
  ttl: (key: string) => Promise<number>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clé Redis canonique par offre (sans sessionId), tenant-scoped.
 * Une seule clé par (agence, offre) garantit l'exclusivité O(1) via SET NX
 * ET empêche toute collision entre deux agences sur un itemId identique —
 * jamais un simple nice-to-have : `agencyId` vient toujours du contexte
 * serveur déjà résolu par l'appelant, jamais d'une valeur cliente.
 */
function buildItemKey(agencyId: string, module: LockModule, itemId: string): string {
  return `e2b:lock:${agencyId}:${module}:${itemId}`
}

/**
 * Clé DB de trace (inclut sessionId pour différencier les lignes audit).
 */
function buildAuditKey(
  agencyId: string,
  module: LockModule,
  itemId: string,
  sessionId: string,
): string {
  return `e2b:lock:${agencyId}:${module}:${itemId}:${sessionId}`
}

// ---------------------------------------------------------------------------
// acquireLock
// ---------------------------------------------------------------------------

/**
 * Tente d'acquérir un verrou exclusif sur une offre.
 *
 * Redis SET NX EX garantit l'atomicité : si la clé existe déjà (verrou tenu
 * par une autre session), SET NX renvoie null → conflict.
 *
 * On utilise une clé par (module, itemId, sessionId) — une même session peut
 * reprendre son propre verrou sans conflit (idempotent).
 */
export async function acquireLock(
  input: AcquireLockInput,
  redisOverride?: InventoryRedis,
): Promise<LockResult> {
  const t0 = Date.now()
  const redis = redisOverride ?? getRedis()

  // FAIL-CLOSED : sans Redis, aucune exclusivité réelle n'existe — ne
  // JAMAIS prétendre avoir posé un verrou. L'appelant (tunnel de
  // réservation "supplier-backed") doit traiter ceci comme un blocage,
  // jamais comme une autorisation à continuer.
  if (!redis) {
    void metrics.slo("inventory", false)
    void metrics.incr("inventory.lock.redis_unavailable")
    logger.warn("[inventory] acquireLock refusé — Redis indisponible (fail-closed)", {
      module: input.module,
      itemId: input.itemId,
    })
    return {
      ok: false,
      reason: "redis_unavailable",
      message: "Le service de verrouillage est temporairement indisponible. Veuillez réessayer.",
    }
  }

  const itemKey = buildItemKey(input.agencyId, input.module, input.itemId)
  const auditKey = buildAuditKey(input.agencyId, input.module, input.itemId, input.sessionId)
  const expiresAt = new Date(Date.now() + LOCK_TTL_SECONDS * 1000)

  // Vérifie d'abord si CETTE session tient déjà le verrou (idempotent)
  const current = await redis.get<string>(itemKey)
  if (current !== null && current !== input.sessionId) {
    // Une AUTRE session tient le verrou
    return {
      ok: false,
      reason: "conflict",
      message: "Cette offre est en cours de réservation par un autre utilisateur.",
    }
  }

  // SET NX EX : atomique O(1) — pose le verrou si absent, ignore si déjà notre session
  if (current === null) {
    await redis.set(itemKey, input.sessionId, { ex: LOCK_TTL_SECONDS, nx: true })
  } else {
    // Renouvelle le TTL pour la même session
    await redis.expire(itemKey, LOCK_TTL_SECONDS)
  }

  // Trace DB (fire-and-forget — ne bloque pas le tunnel, jamais consultée
  // pour la décision d'exclusivité ci-dessus)
  try {
    const lockRecord: NewInventoryLock = {
      agencyId: input.agencyId,
      redisKey: auditKey,
      module: input.module,
      itemId: input.itemId,
      sessionId: input.sessionId,
      priceTnd: input.priceTnd?.toFixed(3) ?? null,
      status: "active",
      expiresAt,
    }
    await withSystemContext((db) =>
      db
        .insert(inventoryLocks)
        .values(lockRecord)
        .onConflictDoUpdate({
          target: [inventoryLocks.redisKey],
          set: { expiresAt, status: "active" },
        }),
    )
  } catch (err) {
    logger.warn("[inventory] Trace DB acquireLock échouée", { err: String(err), module: input.module, itemId: input.itemId })
  }

  void metrics.timing("inventory.latency_ms", Date.now() - t0)
  void metrics.slo("inventory", true)
  void metrics.incr("inventory.lock.ok")
  return { ok: true, expiresAt, lockKey: itemKey }
}

// ---------------------------------------------------------------------------
// releaseLock
// ---------------------------------------------------------------------------

/**
 * Libère le verrou Redis et met à jour le statut en DB.
 * Appelé à la confirmation de réservation ou à l'abandon du tunnel.
 */
export async function releaseLock(
  input: ReleaseLockInput,
  redisOverride?: InventoryRedis,
): Promise<void> {
  const itemKey = buildItemKey(input.agencyId, input.module, input.itemId)
  const auditKey = buildAuditKey(input.agencyId, input.module, input.itemId, input.sessionId)
  const redis = redisOverride ?? getRedis()

  if (redis) {
    // Ne supprime que si c'est bien notre session qui tient le verrou
    const current = await redis.get<string>(itemKey)
    if (current === input.sessionId) {
      await redis.del(itemKey)
    }
  }

  try {
    await withSystemContext((db) =>
      db
        .update(inventoryLocks)
        .set({
          status: input.reservationId ? "confirmed" : "released",
          reservationId: input.reservationId ?? null,
        })
        .where(
          and(
            eq(inventoryLocks.redisKey, auditKey),
            eq(inventoryLocks.status, "active"),
          ),
        ),
    )
  } catch (err) {
    logger.warn("[inventory] Trace DB releaseLock échouée", { err: String(err), module: input.module, itemId: input.itemId })
  }
}

// ---------------------------------------------------------------------------
// refreshLock
// ---------------------------------------------------------------------------

/**
 * Repousse l'expiration du verrou Redis de LOCK_REFRESH_SECONDS.
 * À appeler à chaque étape active du tunnel (keep-alive).
 */
export async function refreshLock(
  input: Omit<ReleaseLockInput, "reservationId">,
  redisOverride?: InventoryRedis,
): Promise<LockResult> {
  const redis = redisOverride ?? getRedis()

  // FAIL-CLOSED : même garde qu'acquireLock — un keep-alive qui "réussit"
  // sans Redis masquerait la perte de toute exclusivité réelle.
  if (!redis) {
    void metrics.incr("inventory.lock.redis_unavailable")
    logger.warn("[inventory] refreshLock refusé — Redis indisponible (fail-closed)", {
      module: input.module,
      itemId: input.itemId,
    })
    return {
      ok: false,
      reason: "redis_unavailable",
      message: "Le service de verrouillage est temporairement indisponible. Veuillez réessayer.",
    }
  }

  const itemKey = buildItemKey(input.agencyId, input.module, input.itemId)
  const auditKey = buildAuditKey(input.agencyId, input.module, input.itemId, input.sessionId)
  const expiresAt = new Date(Date.now() + LOCK_REFRESH_SECONDS * 1000)

  const current = await redis.get<string>(itemKey)
  if (!current) {
    return { ok: false, reason: "conflict", message: "Verrou expiré — relancer la recherche." }
  }
  if (current !== input.sessionId) {
    return { ok: false, reason: "conflict", message: "Ce verrou appartient à une autre session." }
  }
  await redis.expire(itemKey, LOCK_REFRESH_SECONDS)

  try {
    await withSystemContext((db) =>
      db
        .update(inventoryLocks)
        .set({ expiresAt })
        .where(
          and(
            eq(inventoryLocks.redisKey, auditKey),
            eq(inventoryLocks.status, "active"),
          ),
        ),
    )
  } catch (err) {
    logger.warn("[inventory] Trace DB refreshLock échouée", { err: String(err), module: input.module, itemId: input.itemId })
  }

  return { ok: true, expiresAt, lockKey: itemKey }
}

// ---------------------------------------------------------------------------
// checkLock
// ---------------------------------------------------------------------------

/**
 * Vérifie si la session détient encore un verrou valide.
 */
export async function checkLock(
  input: Omit<ReleaseLockInput, "reservationId">,
  redisOverride?: InventoryRedis,
): Promise<{ held: boolean; expiresAt?: Date }> {
  const redis = redisOverride ?? getRedis()
  const itemKey = buildItemKey(input.agencyId, input.module, input.itemId)
  const auditKey = buildAuditKey(input.agencyId, input.module, input.itemId, input.sessionId)

  if (redis) {
    const [current, ttl] = await Promise.all([
      redis.get<string>(itemKey),
      redis.ttl(itemKey),
    ])
    if (current === input.sessionId && ttl > 0) {
      return { held: true, expiresAt: new Date(Date.now() + ttl * 1000) }
    }
    return { held: false }
  }

  // Fallback DB si Redis absent
  try {
    const [lock] = await withSystemContext((db) =>
      db
        .select({ expiresAt: inventoryLocks.expiresAt })
        .from(inventoryLocks)
        .where(
          and(
            eq(inventoryLocks.redisKey, auditKey),
            eq(inventoryLocks.status, "active"),
          ),
        ),
    )
    if (lock && lock.expiresAt > new Date()) {
      return { held: true, expiresAt: lock.expiresAt }
    }
  } catch (err) {
    logger.warn("[inventory] Fallback DB checkLock échoué", { err: String(err), module: input.module, itemId: input.itemId })
  }

  return { held: false }
}

// ---------------------------------------------------------------------------
// cleanExpiredLocks (Cron)
// ---------------------------------------------------------------------------

/**
 * Marque en DB les locks `active` dont `expires_at` est passé.
 * À appeler par le cron job `/api/cron/cleanup`.
 */
export async function cleanExpiredLocks(): Promise<{ cleaned: number }> {
  try {
    const rows = await withSystemContext((db) =>
      db
        .update(inventoryLocks)
        .set({ status: "expired" })
        .where(
          and(
            eq(inventoryLocks.status, "active"),
            lt(inventoryLocks.expiresAt, new Date()),
          ),
        )
        .returning({ id: inventoryLocks.id }),
    )
    return { cleaned: rows.length }
  } catch {
    return { cleaned: 0 }
  }
}
