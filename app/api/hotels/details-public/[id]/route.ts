/**
 * GET /api/hotels/details-public/{id}
 *
 * Détails hôtel (album, descriptions, options) pour le tunnel B2C public
 * (`app/hotels/[id]/page.tsx`) — même moteur (`getMyGoClient().hotelDetail`
 * + `mapHotelDetails`) que `/api/hotels/details/[id]` (B2B, protégé par
 * `requirePartnerSession`), mais SANS session requise.
 *
 * Phase 21.2 (P1) : `app/hotels/[id]/page.tsx` est une page publique (aucun
 * garde d'auth) dont l'UNIQUE appel réseau visait jusqu'ici la route
 * protégée ci-dessus — un visiteur anonyme cliquant "voir détails" depuis
 * les résultats de recherche recevait donc systématiquement un 401. Même
 * séparation déjà adoptée pour la recherche
 * (`/api/hotels/search` protégé vs `/api/hotels/search-public`, voir le
 * commentaire de tête de ce fichier voisin) : on n'affaiblit PAS la route
 * protégée existante, on ajoute une jumelle publique.
 *
 * Sûr à exposer publiquement : `HotelDetailsDTO` (lib/mygo/mappers.ts::
 * mapHotelDetails) ne contient AUCUN champ prix/chambre/tarif/marge/
 * agence — uniquement des métadonnées catalogue statiques (nom,
 * description, photos, options, contact hôtel). Les tarifs restent
 * exclusivement servis par `/api/hotels/search-public` (HotelSearch), pas
 * par ce endpoint (HotelDetail).
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
