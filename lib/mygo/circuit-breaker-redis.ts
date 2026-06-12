/**
 * Circuit Breaker Redis-backed — Easy2Book
 *
 * Variante distribuée de circuit-breaker.ts.
 * L'état et le compteur d'échecs sont stockés dans Redis (Upstash) :
 * tous les pods/instances partagent le même état du circuit.
 *
 * Fallback transparent : si Redis est indisponible, l'état local en mémoire
 * du CircuitBreaker classique est utilisé (import depuis circuit-breaker.ts).
 *
 * Clés Redis :
 *  - `e2b:cb:<name>:state`    → "OPEN" | "CLOSED" | "HALF_OPEN"  (TTL cooldown)
 *  - `e2b:cb:<name>:failures` → compteur d'échecs dans la fenêtre  (TTL window)
 */

import { getRedis } from "@/lib/cache/redis"
import { CircuitBreaker, type CircuitState, type CircuitOptions } from "./circuit-breaker"

export class RedisCircuitBreaker {
  private readonly localFallback: CircuitBreaker
  private readonly stateKey: string
  private readonly failuresKey: string

  constructor(
    private readonly name: string,
    private readonly opts: CircuitOptions,
  ) {
    this.localFallback = new CircuitBreaker(opts)
    this.stateKey = `e2b:cb:${name}:state`
    this.failuresKey = `e2b:cb:${name}:failures`
  }

  async getState(): Promise<CircuitState> {
    const redis = getRedis()
    if (!redis) return this.localFallback.getState()

    try {
      const state = await redis.get<string>(this.stateKey)
      return (state as CircuitState) ?? "CLOSED"
    } catch {
      return this.localFallback.getState()
    }
  }

  async isOpen(): Promise<boolean> {
    return (await this.getState()) === "OPEN"
  }

  /** Appelé avant chaque requête. Lance une erreur si le circuit est ouvert. */
  async beforeCall(): Promise<void> {
    const state = await this.getState()
    if (state === "OPEN") {
      throw new Error(`Circuit breaker [${this.name}] OPEN — requête rejetée.`)
    }
  }

  /** Appelé après un succès API. Réinitialise les compteurs. */
  async onSuccess(): Promise<void> {
    this.localFallback.onSuccess()
    const redis = getRedis()
    if (!redis) return

    try {
      await Promise.all([
        redis.del(this.stateKey),
        redis.del(this.failuresKey),
      ])
    } catch { /* non-bloquant */ }
  }

  /**
   * Appelé après un échec réseau/timeout/5xx.
   * Incrémente le compteur ; si threshold atteint → ouvre le circuit.
   */
  async onFailure(): Promise<void> {
    this.localFallback.onFailure()
    const redis = getRedis()
    if (!redis) return

    try {
      const windowSec = Math.ceil(this.opts.windowMs / 1000)
      const coolDownSec = Math.ceil(this.opts.coolDownMs / 1000)

      // INCR + EXPIRE atomique pour la fenêtre glissante
      const failures = await redis.incr(this.failuresKey)
      if (failures === 1) {
        await redis.expire(this.failuresKey, windowSec)
      }

      if (failures >= this.opts.failureThreshold) {
        // Ouvrir le circuit pour coolDownSec secondes
        await redis.set(this.stateKey, "OPEN", { ex: coolDownSec })
      }

      // Transition OPEN → HALF_OPEN gérée automatiquement par l'expiration TTL
      // (la clé state disparaît après coolDownSec → getState() retourne CLOSED,
      //  le prochain appel beforeCall() passera → HALF_OPEN implicite)
    } catch { /* non-bloquant — état local utilisé en fallback */ }
  }
}

const DEFAULTS: CircuitOptions = {
  failureThreshold: 5,
  windowMs: 60_000,   // 1 minute
  coolDownMs: 120_000, // 2 minutes
}

let sharedRedis: RedisCircuitBreaker | null = null

export function getSharedRedisCircuitBreaker(): RedisCircuitBreaker {
  if (!sharedRedis) {
    sharedRedis = new RedisCircuitBreaker("mygo", DEFAULTS)
  }
  return sharedRedis
}

export function resetSharedRedisCircuitBreaker() {
  sharedRedis = null
}

// ---------------------------------------------------------------------------
// SyncRedisCircuitBreaker
// Adaptateur synchrone compatible avec l'interface CircuitBreaker du client
// MyGo. Maintient un état local (shadow state) mis à jour asynchronement.
// ---------------------------------------------------------------------------

export class SyncRedisCircuitBreaker extends CircuitBreaker {
  private readonly redis: RedisCircuitBreaker
  private refreshPromise: Promise<void> | null = null
  private lastRefreshAt = 0
  private readonly refreshIntervalMs = 2_000

  constructor(name: string, opts: CircuitOptions) {
    super(opts)
    this.redis = new RedisCircuitBreaker(name, opts)
  }

  /** Synchrone — lit l'état local shadow. Lance un refresh async si stale. */
  override isOpen(): boolean {
    this.scheduleRefresh()
    return super.isOpen()
  }

  override getReopensAt(): Date | null {
    return super.getReopensAt()
  }

  /** Notifie Redis de manière asynchrone (fire-and-forget). */
  override onSuccess(): void {
    super.onSuccess()
    this.redis.onSuccess().catch(() => {})
  }

  override onFailure(): void {
    super.onFailure()
    this.redis.onFailure().then(() => this.forceRefresh()).catch(() => {})
  }

  private scheduleRefresh() {
    const now = Date.now()
    if (now - this.lastRefreshAt < this.refreshIntervalMs) return
    if (this.refreshPromise) return
    this.refreshPromise = this.syncStateFromRedis().finally(() => {
      this.refreshPromise = null
    })
  }

  private async forceRefresh() {
    await this.syncStateFromRedis()
  }

  private async syncStateFromRedis() {
    this.lastRefreshAt = Date.now()
    try {
      const redisState = await this.redis.getState()
      if (redisState === "OPEN") {
        // Force l'état local à OPEN via onFailure artificiellement
        // On ne peut pas set state directement (privé) — on utilise
        // le fait qu'un failure >= threshold ouvre le circuit
        ;(this as unknown as { state: string }).state = "OPEN"
        ;(this as unknown as { openedAt: number | null }).openedAt = Date.now()
      } else if (redisState === "CLOSED") {
        ;(this as unknown as { state: string }).state = "CLOSED"
        ;(this as unknown as { failures: number[] }).failures = []
        ;(this as unknown as { openedAt: number | null }).openedAt = null
      }
    } catch { /* non-bloquant */ }
  }
}

let sharedSync: SyncRedisCircuitBreaker | null = null

export function getSharedSyncRedisCircuitBreaker(): SyncRedisCircuitBreaker {
  if (!sharedSync) {
    sharedSync = new SyncRedisCircuitBreaker("mygo", DEFAULTS)
  }
  return sharedSync
}
