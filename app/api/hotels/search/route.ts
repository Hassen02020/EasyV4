/**
 * GET /api/hotels/search?cityId=10&checkin=2026-07-15&checkout=2026-07-20&adults=2&children=5,7
 *
 * Recherche d'hôtels via myGo HotelSearch — accès B2B/partenaire
 * authentifié (`requirePartnerSession`). Pour l'accès public B2C, voir
 * `/api/hotels/search-public` : même moteur de recherche partagé
 * (`lib/mygo/search-core.ts`), contexte d'authentification différent.
 *
 * Cache court (5min) — les prix changent vite.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  HotelSearchQuerySchema,
  validateSearchDateRange,
  executeHotelSearch,
} from "@/lib/mygo/search-core"
import { rateLimit } from "@/lib/rate-limit"
import { requirePartnerSession } from "@/lib/api/auth-guard"
import { resolveMyGoAccessForTenant, partnerTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"

export const revalidate = 300 // 5 min — les prix changent vite

export async function GET(req: NextRequest) {
  const session = await requirePartnerSession(req)
  if (session instanceof NextResponse) return session

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous"
  const limit = await rateLimit(`hotels:search:${ip}`)
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        retryAfter: Math.ceil((limit.reset - Date.now()) / 1000),
      },
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
  const parsed = HotelSearchQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  )
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const q = parsed.data
  const dateCheck = validateSearchDateRange(q.checkin, q.checkout)
  if (!dateCheck.ok) {
    return NextResponse.json(
      { error: dateCheck.error, message: dateCheck.message },
      { status: 400 },
    )
  }

  // PHASE 27.1 — compte fournisseur MyGo résolu pour l'agence de CETTE
  // session partenaire (jamais le compte global MYGO_* si un compte tenant
  // est configuré) — voir lib/hotel-suppliers/tenant/live-resolution.ts.
  const tenantContext = partnerTenantContext(session.agencyId, session.userId, session.role === "super_admin")
  const access = await resolveMyGoAccessForTenant(tenantContext)
  return executeHotelSearch(q, access.client ? { client: access.client } : undefined)
}
