/**
 * GET /api/hotels/search?cityId=10&checkin=2026-07-15&checkout=2026-07-20&adults=2&children=5,7
 *
 * Recherche d'hôtels via myGo HotelSearch.
 * Cache court (5min) — les prix changent vite.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  getMyGoClient,
  isRealHotelOffer,
  mapHotelOffer,
  dedupeOffersByHotelId,
} from "@/lib/mygo"
import { MyGoAuthError, MyGoError } from "@/lib/mygo"
import { HotelSearchResponse } from "@/lib/mygo/schemas"
import type { HotelSearchResultDTO } from "@/lib/mygo/types"
import hotelSearchFixture from "@/lib/mygo/__fixtures__/hotelsearch.json"

const isDemoMode = () =>
  !process.env.MYGO_LOGIN || process.env.MYGO_LOGIN.length === 0

const QuerySchema = z.object({
  cityId: z.coerce.number().int().positive(),
  checkin: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "checkin must be YYYY-MM-DD"),
  checkout: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "checkout must be YYYY-MM-DD"),
  adults: z.coerce.number().int().min(1).max(8).default(2),
  children: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(",")
            .map((x) => parseInt(x, 10))
            .filter((n) => Number.isFinite(n) && n >= 0 && n <= 17)
        : [],
    ),
  currency: z.string().optional(),
  stars: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(",")
            .map((x) => parseInt(x, 10))
            .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5)
        : [],
    ),
  onlyAvailable: z
    .union([
      z.literal("0"),
      z.literal("1"),
      z.literal("true"),
      z.literal("false"),
    ])
    .optional()
    .transform((v) => v === "1" || v === "true"),
  hotelId: z.coerce.number().int().positive().optional(),
})

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const q = parsed.data
  if (q.checkout <= q.checkin) {
    return NextResponse.json(
      { error: "invalid_dates", message: "checkout must be after checkin" },
      { status: 400 },
    )
  }

  if (isDemoMode()) {
    return demoSearchResponse(q.cityId)
  }

  try {
    const result = await getMyGoClient().searchHotels({
      cityId: q.cityId,
      checkIn: q.checkin,
      checkOut: q.checkout,
      currency: q.currency ?? "TND",
      hotelId: q.hotelId,
      rooms: [{ adults: q.adults, childAges: q.children }],
      filters: {
        onlyAvailable: q.onlyAvailable ?? true,
        ...(q.stars.length ? { categories: q.stars } : {}),
      },
    })

    const rawOffers = result.hotels.filter(isRealHotelOffer).map(mapHotelOffer)
    const offers = dedupeOffersByHotelId(rawOffers)
    const dto: HotelSearchResultDTO = {
      searchId: result.searchId ?? undefined,
      count: offers.length,
      offers,
    }
    return NextResponse.json(dto, { status: 200 })
  } catch (err) {
    return mapErrorToResponse(err)
  }
}

function demoSearchResponse(cityId: number): NextResponse {
  const parsed = HotelSearchResponse.safeParse(hotelSearchFixture)
  if (!parsed.success || !parsed.data.HotelSearch) {
    const empty: HotelSearchResultDTO = { count: 0, offers: [] }
    return NextResponse.json(empty, { status: 200 })
  }
  const rawOffers = parsed.data.HotelSearch.filter(
    (h) => h.Hotel?.City?.Id === cityId,
  )
    .filter(isRealHotelOffer)
    .map(mapHotelOffer)
  const offers = dedupeOffersByHotelId(rawOffers)
  const dto: HotelSearchResultDTO = {
    searchId: "demo-fixture",
    count: offers.length,
    offers,
  }
  return NextResponse.json(dto, {
    status: 200,
    headers: { "x-demo-mode": "1" },
  })
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
