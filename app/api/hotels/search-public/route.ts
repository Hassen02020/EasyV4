/**
 * GET /api/hotels/search-public?cityId=10&checkin=2026-07-15&checkout=2026-07-20&adults=2&children=5,7
 *
 * Recherche d'hôtels via myGo HotelSearch — accès PUBLIC B2C, aucune
 * session requise. Utilise le même moteur de recherche partagé
 * (`lib/mygo/search-core.ts`) que `/api/hotels/search` (B2B/partenaire
 * authentifié) : une seule logique métier, deux contextes d'authentification.
 *
 * Frontière de sécurité — cette route :
 *   - n'accepte QUE les paramètres de recherche (destination, dates,
 *     occupation, filtres d'affichage) — `HotelSearchQuerySchema` ne
 *     contient aucun champ `agencyId`/`partnerId`/`walletId`/prix/marge ;
 *   - ne renvoie jamais les credentials myGo (server-only,
 *     `getMyGoConfig()`/`MyGoClient`, jamais exposés au DTO) ;
 *   - ne renvoie que le DTO normalisé (`HotelOfferDTO`), jamais la réponse
 *     XML/JSON brute de myGo ;
 *   - est rate-limitée par IP (bucket dédié `hotels:search-public:*`,
 *     distinct du bucket B2B `hotels:search:*`) pour protéger le quota
 *     fournisseur d'un visiteur anonyme abusif.
 *
 * Voir EASYV4_B2C_PUBLIC_SEARCH_REPORT.md pour l'audit complet ayant motivé
 * cette séparation (au lieu de simplement retirer `requirePartnerSession`
 * de la route B2B existante, qui reste protégée et inchangée).
 */

import { NextRequest, NextResponse } from "next/server"
import {
  HotelSearchQuerySchema,
  validateSearchDateRange,
} from "@/lib/mygo/search-core"
import { rateLimit } from "@/lib/rate-limit"
import { resolveMyGoAccessForTenant, guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { executeHotelSearchThroughHub } from "@/lib/hotel-suppliers/search-hub"

export const revalidate = 300 // 5 min — les prix changent vite

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous"
  const limit = await rateLimit(`hotels:search-public:${ip}`)
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

  // PHASE 27.1 — visiteur anonyme : compte fournisseur MyGo résolu pour
  // l'agence OTA par défaut (même résolution white-label-aware que le reste
  // du guest booking, jamais un ID accepté du client) — voir
  // lib/hotel-suppliers/tenant/live-resolution.ts.
  const tenantContext = await guestTenantContext()
  const access = tenantContext ? await resolveMyGoAccessForTenant(tenantContext) : undefined
  // PHASE 28 — recherche orchestrée par le Hub — contrat de réponse
  // inchangé, voir lib/hotel-suppliers/search-hub.ts.
  return executeHotelSearchThroughHub(q, access, { agencyId: tenantContext?.agencyId ?? null })
}
