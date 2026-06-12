/**
 * GET /api/cron/warm-cache
 *
 * Préchauffe le cache Redis Upstash avec les données statiques MyGo
 * (villes, regimes, devises, tags) et les hôtels des destinations phares.
 *
 * Protégé par CRON_SECRET (header Authorization: Bearer <token>).
 *
 * Usage manuel :
 *   curl https://<host>/api/cron/warm-cache \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Config Vercel Cron (vercel.json) :
 *   { "path": "/api/cron/warm-cache", "schedule": "0 4 * * *" }
 *
 * Config Netlify Scheduled Functions :
 *   netlify.toml → [[functions]] schedule = "@daily"
 */

import { type NextRequest, NextResponse } from "next/server"
import { MyGoClient } from "@/lib/mygo/client"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // Vercel Pro: 60s max pour un cron

/* Villes phares à précharger (IDs MyGo — Tunisie) */
const WARM_CITY_IDS = [
  1,   // Tunis
  2,   // Sousse
  3,   // Monastir
  4,   // Hammamet
  5,   // Djerba
  6,   // Tabarka
  7,   // Tozeur
  8,   // Mahdia
]

/* Paramètres de recherche pour le warm-up (demain + 2 nuits, 2 adultes) */
function warmSearchParams(cityId: number) {
  const checkIn = new Date(Date.now() + 86_400_000) // demain
  const checkOut = new Date(Date.now() + 3 * 86_400_000) // +2 nuits
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return {
    cityId,
    checkIn: fmt(checkIn),
    checkOut: fmt(checkOut),
    rooms: [{ adults: 2 }],
  }
}

export async function GET(request: NextRequest) {
  /* --- Auth --- */
  const auth = request.headers.get("authorization")
  const token = auth?.replace("Bearer ", "").trim()
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return NextResponse.json(
      { error: "Redis non configuré — UPSTASH_REDIS_REST_URL manquant" },
      { status: 503 },
    )
  }

  const client = new MyGoClient()
  const results: Record<string, { ok: boolean; count?: number; error?: string }> = {}
  const t0 = Date.now()

  /* --- 1. Données statiques --- */
  for (const [name, fn] of [
    ["cities",    () => client.listCities()],
    ["boardings", () => client.listBoardings()],
    ["currencies",() => client.listCurrencies()],
    ["tags",      () => client.listTags()],
  ] as const) {
    try {
      const data = await fn()
      results[name] = { ok: true, count: data.length }
    } catch (err) {
      results[name] = { ok: false, error: String(err) }
    }
  }

  /* --- 2. Recherches hôtels par ville phare --- */
  for (const cityId of WARM_CITY_IDS) {
    const key = `search:city_${cityId}`
    try {
      const data = await client.searchHotels(warmSearchParams(cityId))
      results[key] = { ok: true, count: data.count }
    } catch (err) {
      results[key] = { ok: false, error: String(err) }
    }
  }

  const durationMs = Date.now() - t0
  const errors = Object.values(results).filter((r) => !r.ok).length

  console.log(`[warm-cache] Terminé en ${durationMs}ms — ${errors} erreurs`)

  return NextResponse.json({
    ok: errors === 0,
    durationMs,
    errors,
    results,
    warmedAt: new Date().toISOString(),
  })
}
