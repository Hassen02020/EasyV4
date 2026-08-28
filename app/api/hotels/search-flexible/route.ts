/**
 * GET /api/hotels/search-flexible?cityId=10&checkin=2026-07-15&checkout=2026-07-20&adults=2&flexDays=3
 *
 * PHASE 34 — recherche à dates flexibles, accès PUBLIC B2C (même frontière
 * de sécurité que /api/hotels/search-public : aucune session requise,
 * aucun champ agencyId/partnerId/prix/marge accepté du client, credentials
 * myGo jamais exposées). Réutilise EXACTEMENT le même schéma de requête
 * (`HotelSearchQuerySchema`) et le même moteur de recherche que la
 * recherche classique — `flexDays` est le SEUL paramètre ajouté, optionnel
 * (0 par défaut = comportement identique à une recherche classique).
 *
 * N'appelle jamais MyGo directement : chaque date candidate passe par
 * `runFlexibleHotelSearch()` (lib/hotel-suppliers/flexible-search.ts), qui
 * appelle `runSearchThroughHub()` (Universal Hub) une fois par candidat.
 *
 * Bucket de rate-limit DÉDIÉ (`hotels:search-flexible:*`, distinct de
 * `hotels:search-public:*`) : une requête flexible coûte jusqu'à
 * 2×flexDays+1 appels fournisseur réels (max 7, voir MAX_FLEX_DAYS) — la
 * isoler protège le quota de la recherche classique d'un visiteur qui
 * abuserait du mode flexible.
 */

import { NextRequest, NextResponse } from "next/server"
import { HotelSearchQuerySchema, validateSearchDateRange } from "@/lib/mygo/search-core"
import { rateLimit } from "@/lib/rate-limit"
import { resolveMyGoAccessForTenant, guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { runFlexibleHotelSearch, MAX_FLEX_DAYS } from "@/lib/hotel-suppliers/flexible-search"

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous"
  const limit = await rateLimit(`hotels:search-flexible:${ip}`)
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: Math.ceil((limit.reset - Date.now()) / 1000) },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit.limit),
          "X-RateLimit-Remaining": String(limit.remaining),
          "X-RateLimit-Reset": String(limit.reset),
        },
      },
    )
  }

  const { searchParams } = new URL(req.url)
  const parsed = HotelSearchQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 })
  }

  const q = parsed.data
  const dateCheck = validateSearchDateRange(q.checkin, q.checkout)
  if (!dateCheck.ok) {
    return NextResponse.json({ error: dateCheck.error, message: dateCheck.message }, { status: 400 })
  }

  const flexDaysRaw = Number.parseInt(searchParams.get("flexDays") ?? "0", 10)
  const flexDays = Number.isFinite(flexDaysRaw) ? Math.max(0, Math.min(MAX_FLEX_DAYS, flexDaysRaw)) : 0

  const tenantContext = await guestTenantContext()
  const access = tenantContext ? await resolveMyGoAccessForTenant(tenantContext) : undefined

  const result = await runFlexibleHotelSearch(q, flexDays, access)
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=120" },
  })
}
