/**
 * GET /api/health
 *
 * Health check endpoint pour load balancers, Vercel Health Checks,
 * et dashboard de monitoring interne.
 *
 * Réponse publique (sans token) : { status: "ok" | "degraded" | "down" }
 * Réponse détaillée (avec HEALTH_SECRET) : métriques SLO + latences P99
 *
 * SLIs surveillés :
 *  1. mygo.search   → SLO cible 99.5% succès / P99 < 3000ms
 *  2. wallet.debit  → SLO cible 99.9% succès / P99 < 500ms
 *  3. inventory     → SLO cible 99.9% succès / P99 < 200ms
 *
 * Usage Vercel Health Checks (vercel.json) :
 *   "healthcheck": { "path": "/api/health" }
 */

import { type NextRequest, NextResponse } from "next/server"
import { getRedis } from "@/lib/cache/redis"
import { metrics } from "@/lib/observability/metrics"
import { getSharedSyncRedisCircuitBreaker } from "@/lib/mygo/circuit-breaker-redis"

export const dynamic = "force-dynamic"
export const revalidate = 0

// SLOs définis en tant que contrats
const SLO_TARGETS = {
  "mygo.search":   { successRate: 0.995, p99Ms: 3_000 },
  "wallet.debit":  { successRate: 0.999, p99Ms: 500 },
  "inventory":     { successRate: 0.999, p99Ms: 200 },
} as const

type SloName = keyof typeof SLO_TARGETS

async function checkRedis(): Promise<{ ok: boolean; latencyMs?: number }> {
  const redis = getRedis()
  if (!redis) return { ok: false }
  const t0 = Date.now()
  try {
    await redis.ping()
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch {
    return { ok: false }
  }
}

async function buildSloReport() {
  const report: Record<string, {
    slo: boolean
    successRate: number | null
    p99Ms: number | null
    target: { successRate: number; p99Ms: number }
  }> = {}

  for (const [name, target] of Object.entries(SLO_TARGETS) as [SloName, typeof SLO_TARGETS[SloName]][]) {
    const [sloData, p99] = await Promise.all([
      metrics.readSlo(name),
      metrics.readPercentile(`${name}.latency_ms`, 99),
    ])

    const successRate = sloData?.rate ?? null
    const sloOk =
      (successRate === null || successRate >= target.successRate) &&
      (p99 === null || p99 <= target.p99Ms)

    report[name] = { slo: sloOk, successRate, p99Ms: p99, target }
  }

  return report
}

export async function GET(request: NextRequest) {
  const isDetailed =
    request.headers.get("x-health-secret") === process.env.HEALTH_SECRET &&
    !!process.env.HEALTH_SECRET

  // Check rapide Redis
  const redisCheck = await checkRedis()

  // Circuit breaker MyGo
  const mygoBreaker = getSharedSyncRedisCircuitBreaker()
  const mygoOpen = mygoBreaker.isOpen()

  // Statut global
  const overallOk = redisCheck.ok && !mygoOpen
  const status = overallOk ? "ok" : mygoOpen ? "degraded" : "down"

  // Réponse publique minimale
  const publicBody = {
    status,
    ts: new Date().toISOString(),
    ...(mygoOpen ? { mygo: "circuit_open" } : {}),
    ...(redisCheck.ok ? {} : { redis: "unavailable" }),
  }

  if (!isDetailed) {
    return NextResponse.json(publicBody, {
      status: status === "down" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    })
  }

  // Réponse détaillée (dashboard interne)
  const [sloReport] = await Promise.all([buildSloReport()])

  const sloViolations = Object.entries(sloReport)
    .filter(([, v]) => !v.slo)
    .map(([k]) => k)

  const detailedBody = {
    ...publicBody,
    redis: redisCheck,
    mygoCircuit: mygoOpen ? "OPEN" : "CLOSED",
    slo: sloReport,
    sloViolations,
    sloHealth: sloViolations.length === 0 ? "all_green" : "violations_detected",
  }

  return NextResponse.json(detailedBody, {
    status: status === "down" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  })
}
