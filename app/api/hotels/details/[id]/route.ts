/**
 * GET /api/hotels/details/{id}
 *
 * Renvoie les détails complets d'un hôtel (Album, descriptions longues, options).
 * Cache 24h.
 */

import { NextRequest, NextResponse } from "next/server"
import { getMyGoClient, mapHotelDetails } from "@/lib/mygo"
import { MyGoAuthError, MyGoError } from "@/lib/mygo"

export const revalidate = 86400

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    { error: "internal", message: err instanceof Error ? err.message : "unknown" },
    { status: 500 },
  )
}
