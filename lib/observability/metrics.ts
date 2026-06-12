/**
 * Métriques légères Redis-backed — Easy2Book SRE
 *
 * Stocke des compteurs et histogrammes dans Redis Upstash.
 * Zéro dépendance externe (pas de Prometheus, pas d'OpenTelemetry).
 * Compatible Vercel Edge + Serverless.
 *
 * Clés Redis utilisées :
 *   e2b:metrics:<window>:<name>   → INCR   (compteurs par fenêtre 1min)
 *   e2b:metrics:p99:<name>        → LIST   (latences en ms, max 1000 entrées)
 *   e2b:metrics:slo:<name>        → HASH   { ok, total }  (taux succès)
 *
 * Fenêtres : "1m" (60s), "1h" (3600s), "1d" (86400s)
 *
 * Usage :
 *   import { metrics } from "@/lib/observability/metrics"
 *   await metrics.incr("mygo.search.ok")
 *   await metrics.incr("mygo.search.error")
 *   await metrics.timing("mygo.search.latency_ms", 342)
 *   await metrics.slo("mygo.search", true)
 */

import { getRedis } from "@/lib/cache/redis"

export type MetricWindow = "1m" | "1h" | "1d"

const TTL: Record<MetricWindow, number> = {
  "1m": 120,    // garde 2 min pour être sûr
  "1h": 7_200,
  "1d": 172_800,
}

const WINDOW_SECONDS: Record<MetricWindow, number> = {
  "1m": 60,
  "1h": 3_600,
  "1d": 86_400,
}

function windowKey(window: MetricWindow): string {
  const now = Math.floor(Date.now() / (WINDOW_SECONDS[window] * 1000))
  return `${window}:${now}`
}

function metricKey(window: MetricWindow, name: string): string {
  return `e2b:metrics:${windowKey(window)}:${name}`
}

/**
 * Incrémente un compteur dans toutes les fenêtres (1m, 1h, 1d).
 * Fire-and-forget : ne bloque pas si Redis est absent.
 */
async function incr(name: string, by = 1): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await Promise.all(
      (["1m", "1h", "1d"] as MetricWindow[]).map(async (w) => {
        const key = metricKey(w, name)
        await redis.incrby(key, by)
        await redis.expire(key, TTL[w])
      }),
    )
  } catch { /* non-bloquant */ }
}

/**
 * Enregistre une mesure de latence (ms) dans un RPUSH/LTRIM.
 * Max 1000 valeurs conservées — permet calcul percentile côté health endpoint.
 */
async function timing(name: string, ms: number): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    const key = `e2b:metrics:p99:${name}`
    await redis.rpush(key, String(Math.round(ms)))
    await redis.ltrim(key, -1000, -1)
    await redis.expire(key, 3_600) // 1h
  } catch { /* non-bloquant */ }
}

/**
 * Enregistre un résultat OK/KO pour le calcul du SLO (error rate).
 * Hash { ok: number, total: number } par fenêtre 1h.
 */
async function slo(name: string, ok: boolean): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    const key = `e2b:metrics:slo:${windowKey("1h")}:${name}`
    await redis.hincrby(key, "total", 1)
    if (ok) await redis.hincrby(key, "ok", 1)
    await redis.expire(key, TTL["1h"])
  } catch { /* non-bloquant */ }
}

/**
 * Lit un compteur pour une fenêtre donnée.
 * Utilisé par le health endpoint.
 */
async function read(name: string, window: MetricWindow): Promise<number> {
  const redis = getRedis()
  if (!redis) return 0
  try {
    const val = await redis.get<string>(metricKey(window, name))
    return val ? parseInt(val, 10) : 0
  } catch { return 0 }
}

/**
 * Lit le percentile P50/P95/P99 d'une métrique de latence.
 */
async function readPercentile(name: string, p: 50 | 95 | 99): Promise<number | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const raw = await redis.lrange(`e2b:metrics:p99:${name}`, 0, -1)
    if (!raw || raw.length === 0) return null
    const sorted = raw.map(Number).sort((a, b) => a - b)
    const idx = Math.floor((p / 100) * sorted.length)
    return sorted[Math.min(idx, sorted.length - 1)] ?? null
  } catch { return null }
}

/**
 * Lit le taux de succès SLO pour la fenêtre 1h courante.
 * Retourne null si pas de données.
 */
async function readSlo(name: string): Promise<{ ok: number; total: number; rate: number } | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const key = `e2b:metrics:slo:${windowKey("1h")}:${name}`
    const hash = await redis.hgetall<Record<string, string>>(key)
    if (!hash) return null
    const ok = parseInt(hash.ok ?? "0", 10)
    const total = parseInt(hash.total ?? "0", 10)
    if (total === 0) return null
    return { ok, total, rate: ok / total }
  } catch { return null }
}

export const metrics = { incr, timing, slo, read, readPercentile, readSlo }
