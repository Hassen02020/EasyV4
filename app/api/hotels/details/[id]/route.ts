/**
 * GET /api/hotels/details/{id}
 *
 * Renvoie les détails complets d'un hôtel (Album, descriptions longues, options).
 * Cache 24h.
 */

import { NextRequest, NextResponse } from "next/server"
import { hotelErrorResponse } from "@/lib/api/hotel-error-response"
import { getMyGoClient, mapHotelDetails } from "@/lib/mygo"
import { requirePartnerSession } from "@/lib/api/auth-guard"

export const revalidate = 86400

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePartnerSession(req)
  if (session instanceof NextResponse) return session

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
  // HOTEL-ERROR-MESSAGE-01 : jamais de texte technique dans la réponse publique.
  return hotelErrorResponse(err, "/api/hotels/details")
}
