/**
 * GET /api/hotels/details/{id}
 *
 * Renvoie les détails complets d'un hôtel (Album, descriptions longues, options).
 * Cache 24h.
 *
 * Accès PUBLIC B2C, aucune session requise — même bascule que
 * `/api/hotels/search-public` (voir EASYV4_B2C_PUBLIC_SEARCH_REPORT.md).
 * `app/hotels/[id]/page.tsx` (la page de détail hôtel B2C, seul appelant
 * de cette route dans tout le dépôt — aucune page `/pro/*` ne l'utilise)
 * l'appelait déjà sans session, ce qui faisait échouer systématiquement
 * cette page avec `requirePartnerSession` (401 "Session invalide ou
 * expirée" pour tout visiteur anonyme) — trouvé lors de la validation
 * réelle Phase 14.1. `mapHotelDetails` (lib/mygo/mappers.ts) ne renvoie
 * que des données descriptives publiques (nom, étoiles, adresse,
 * descriptions, photos, options, horaires check-in/out) — aucun prix,
 * aucune marge, aucun secret fournisseur. Rate-limitée par IP comme
 * `/api/hotels/search-public`, pour la même raison (protéger le quota
 * fournisseur d'un visiteur anonyme abusif).
 */

import { NextRequest, NextResponse } from "next/server"
import { getMyGoClient, mapHotelDetails } from "@/lib/mygo"
import { MyGoAuthError, MyGoError } from "@/lib/mygo"
import { rateLimit } from "@/lib/rate-limit"

export const revalidate = 86400

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous"
  const limit = await rateLimit(`hotels:details-public:${ip}`)
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

  const { id } = await params
  const hotelId = parseInt(id, 10)
  if (!Number.isFinite(hotelId) || hotelId <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 })
  }

  try {
    const detail = await getMyGoClient().hotelDetail(hotelId)
    if (!detail) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json(mapHotelDetails(detail), { status: 200 })
  } catch (err) {
    return mapErrorToResponse(err)
  }
}

function mapErrorToResponse(err: unknown): NextResponse {
  if (err instanceof MyGoAuthError) {
    return NextResponse.json(
      { error: "auth_failed", message: "myGo credentials invalid" },
      { status: 502 },
    )
  }
  if (err instanceof MyGoError) {
    return NextResponse.json(
      { error: err.kind, message: err.message },
      { status: 502 },
    )
  }
  return NextResponse.json(
    {
      error: "internal",
      message: err instanceof Error ? err.message : "unknown",
    },
    { status: 500 },
  )
}
