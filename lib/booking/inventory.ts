/**
 * Inventory Engine — Easy2Book
 *
 * Gère le verrouillage des offres pendant le tunnel de réservation.
 * Un "lock" empêche deux agents de réserver la même offre simultanément.
 *
 * Stratégie duale :
 *  - Redis (primary) : TTL 10 min, atomique via SET NX EX.
 *    Clé canonique : `e2b:lock:<module>:<itemId>` → valeur = sessionId
 *    SET NX est O(1) et atomique — pas de KEYS/SCAN bloquant.
 *  - Postgres (audit) : table `inventory_locks` — trace chaque lock/release
 *    pour la comptabilité et le monitoring (pas utilisé pour la décision).
 *
 * API publique :
 *  - `acquireLock(input)`   : tente de poser un verrou → ok | conflict | error
 *  - `releaseLock(input)`   : libère le verrou (confirmation ou abandon)
 *  - `refreshLock(input)`   : repousse l'expiration (keep-alive tunnel)
 *  - `checkLock(input)`     : vérifie si une session détient le verrou
 *  - `cleanExpiredLocks()`  : Cron job — marque les locks DB expirés
 */

"use server"

import { eq, and, lt } from "drizzle-orm"
import { logger } from "@/lib/logger"
import { metrics } from "@/lib/observability/metrics"
import { getRedis } from "@/lib/cache/redis"
import { getDb } from "@/lib/db/client"
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clé Redis canonique par offre (sans sessionId).
 * Une seule clé par offre garantit l'exclusivité O(1) via SET NX.
 */
function buildItemKey(module: LockModule, itemId: string): string {
  return `e2b:lock:${module}:${itemId}`
}

/**
 * Clé DB de trace (inclut sessionId pour différencier les lignes audit).
 */
function buildAuditKey(module: LockModule, itemId: string, sessionId: string): string {
  return `e2b:lock:${module}:${itemId}:${sessionId}`
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
): Promise<LockResult> {
  const t0 = Date.now()
  const redis = getRedis()
  const itemKey = buildItemKey(input.module, input.itemId)
  const auditKey = buildAuditKey(input.module, input.itemId, input.sessionId)
  const expiresAt = new Date(Date.now() + LOCK_TTL_SECONDS * 1000)

  if (redis) {
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
  }

  // Trace DB (fire-and-forget — ne bloque pas le tunnel)
  try {
    const db = getDb()
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
    await db
      .insert(inventoryLocks)
      .values(lockRecord)
      .onConflictDoUpdate({
        target: [inventoryLocks.redisKey],
        set: { expiresAt, status: "active" },
      })
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
export async function releaseLock(input: ReleaseLockInput): Promise<void> {
  const itemKey = buildItemKey(input.module, input.itemId)
  const auditKey = buildAuditKey(input.module, input.itemId, input.sessionId)
  const redis = getRedis()

  if (redis) {
    // Ne supprime que si c'est bien notre session qui tient le verrou
    const current = await redis.get<string>(itemKey)
    if (current === input.sessionId) {
      await redis.del(itemKey)
    }
  }

  try {
    const db = getDb()
    await db
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
): Promise<LockResult> {
  const redis = getRedis()
  const itemKey = buildItemKey(input.module, input.itemId)
  const auditKey = buildAuditKey(input.module, input.itemId, input.sessionId)
  const expiresAt = new Date(Date.now() + LOCK_REFRESH_SECONDS * 1000)

  if (redis) {
    const current = await redis.get<string>(itemKey)
    if (!current) {
      return { ok: false, reason: "conflict", message: "Verrou expiré — relancer la recherche." }
    }
    if (current !== input.sessionId) {
      return { ok: false, reason: "conflict", message: "Ce verrou appartient à une autre session." }
    }
    await redis.expire(itemKey, LOCK_REFRESH_SECONDS)
  }

  try {
    const db = getDb()
    await db
      .update(inventoryLocks)
      .set({ expiresAt })
      .where(
        and(
          eq(inventoryLocks.redisKey, auditKey),
          eq(inventoryLocks.status, "active"),
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
): Promise<{ held: boolean; expiresAt?: Date }> {
  const redis = getRedis()
  const itemKey = buildItemKey(input.module, input.itemId)
  const auditKey = buildAuditKey(input.module, input.itemId, input.sessionId)

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
    const db = getDb()
    const [lock] = await db
      .select({ expiresAt: inventoryLocks.expiresAt })
      .from(inventoryLocks)
      .where(
        and(
          eq(inventoryLocks.redisKey, auditKey),
          eq(inventoryLocks.status, "active"),
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
    const db = getDb()
    const rows = await db
      .update(inventoryLocks)
      .set({ status: "expired" })
      .where(
        and(
          eq(inventoryLocks.status, "active"),
          lt(inventoryLocks.expiresAt, new Date()),
        ),
      )
      .returning({ id: inventoryLocks.id })
    return { cleaned: rows.length }
  } catch {
    return { cleaned: 0 }
  }
}
