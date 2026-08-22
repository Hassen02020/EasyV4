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
import { getMyGoClient, mapHotelSummary, MyGoAuthError, MyGoError } from "@/lib/mygo"

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
    { error: "internal", message: err instanceof Error ? err.message : "unknown" },
    { status: 500 },
  )
}
