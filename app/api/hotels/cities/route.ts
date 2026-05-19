/**
 * GET /api/hotels/cities
 *
 * Renvoie la liste des villes Tunisie disponibles dans le catalogue myGo.
 * Cache 24h (les villes ne bougent quasiment jamais).
 */

import { NextRequest, NextResponse } from "next/server"
import { getMyGoClient, mapCity } from "@/lib/mygo"
import { MyGoAuthError, MyGoError } from "@/lib/mygo"
import { rateLimit } from "@/lib/rate-limit"

export const revalidate = 86400 // 24h

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous"
  const limit = await rateLimit(`hotels:cities:${ip}`)
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

  try {
    const cities = await getMyGoClient().listCities()
    const tunisianCities = cities
      .map(mapCity)
      // Pour le module "Hôtels Tunisie", on ne sert que les villes tunisiennes.
      .filter((c) => !c.countryName || c.countryName === "Tunisie")
      .sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json(
      { cities: tunisianCities },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=86400, immutable",
        },
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
    {
      error: "internal",
      message: err instanceof Error ? err.message : "unknown",
    },
    { status: 500 },
  )
}
