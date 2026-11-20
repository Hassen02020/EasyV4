/**
 * GET /api/hotels/list?cityId=32
 *
 * Recherche directe par hôtel ("destination = hôtel", mandat Phase 14) —
 * réutilise `MyGoClient.listHotels(cityId?)` (déjà réel, déjà utilisé par
 * `hotelDetail`/`ListHotel`, jamais exposé par une route jusqu'ici) et le
 * mapper déjà existant `mapHotelSummary` (le même que `/api/hotels/details`).
 * Aucune capacité fournisseur inventée : `HotelSearchQuerySchema.hotelId`
 * (lib/mygo/search-core.ts) accepte déjà cet id nativement.
 *
 * `cityId` optionnel : sans lui, myGo renvoie le catalogue complet — utile
 * pour un autocomplete "toutes destinations", mais peut être volumineux ;
 * le cache 24h (`listHotels`, TTL `staticDataTtlSeconds`) absorbe le coût.
 */

import { NextRequest, NextResponse } from "next/server"
import { hotelErrorResponse } from "@/lib/api/hotel-error-response"
import { getMyGoClient, mapHotelSummary } from "@/lib/mygo"

export const revalidate = 86400 // 24h — même politique que /api/hotels/cities

export async function GET(req: NextRequest) {
  const cityIdParam = req.nextUrl.searchParams.get("cityId")
  const cityId =
    cityIdParam && /^\d+$/.test(cityIdParam) ? Number(cityIdParam) : undefined

  try {
    const raw = await getMyGoClient().listHotels(cityId)
    const hotels = raw
      .map(mapHotelSummary)
      .sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json(
      { hotels },
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=86400, immutable" },
      },
    )
  } catch (err) {
    return mapErrorToResponse(err)
  }
}

function mapErrorToResponse(err: unknown): NextResponse {
  // HOTEL-ERROR-MESSAGE-01 : jamais de texte technique dans la réponse publique.
  return hotelErrorResponse(err, "/api/hotels/list")
}
