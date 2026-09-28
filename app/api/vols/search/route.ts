/**
 * GET /api/vols/search
 *
 * Public B2C search. Validates the request, runs the Search Orchestrator
 * across all configured GDS adapters, applies the Commercial Engine, persists
 * a Price Snapshot per itinerary, and returns selling prices + snapshotIds.
 *
 * The supplier price is NEVER returned — only sellingAmount + snapshotId.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { rateLimit } from "@/lib/rate-limit"
import { orchestrateSearch } from "@/lib/vols/orchestrator"
import { createPriceSnapshot } from "@/lib/vols/price-snapshot"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { withSystemContext } from "@/lib/db/tenant-context"
import { flightSearches } from "@/lib/db/schema/flights"
import type { CanonicalSearchRequest, TripType, SearchPreferences } from "@/lib/vols/canonical"

export const runtime = "nodejs"
export const revalidate = 0

const SearchSchema = z.object({
  origin: z.string().min(3).max(3).toUpperCase(),
  destination: z.string().min(3).max(3).toUpperCase(),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tripType: z.enum(["ONE_WAY", "ROUND_TRIP", "MULTI_CITY"]).default("ONE_WAY"),
  adults: z.coerce.number().int().min(1).max(9).default(1),
  children: z.coerce.number().int().min(0).max(8).default(0),
  infants: z.coerce.number().int().min(0).max(4).default(0),
  cabin: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]).default("ECONOMY"),
  currency: z.string().length(3).default("TND"),
  segments: z.string().optional(), // JSON-encoded CanonicalSearchSegment[] for MULTI_CITY
  // Search preferences (JSON-encoded SearchPreferences)
  preferences: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "anon"
  const rl = await rateLimit(`vols:search:${ip}`)
  if (!rl.ok) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 })
  }

  const raw = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = SearchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres invalides", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const p = parsed.data

  // Validate trip-type constraints
  if (p.tripType === "ROUND_TRIP" && !p.returnDate) {
    return NextResponse.json(
      { error: "returnDate requis pour un aller-retour." },
      { status: 400 },
    )
  }

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return NextResponse.json({ error: "Configuration agence manquante." }, { status: 500 })
  }

  // Parse multi-city segments if provided
  let segments: CanonicalSearchRequest["segments"]
  if (p.tripType === "MULTI_CITY" && p.segments) {
    try {
      segments = JSON.parse(p.segments)
    } catch {
      return NextResponse.json(
        { error: "segments invalide pour multi-city." },
        { status: 400 },
      )
    }
  }

  // Parse search preferences if provided
  let preferences: SearchPreferences | undefined
  if (p.preferences) {
    try {
      preferences = JSON.parse(p.preferences) as SearchPreferences
    } catch {
      // Non-fatal — ignore malformed preferences
    }
  }

  const request: CanonicalSearchRequest = {
    tripType: p.tripType as TripType,
    origin: p.origin,
    destination: p.destination,
    departureDate: p.departureDate,
    returnDate: p.returnDate,
    segments,
    adults: p.adults,
    children: p.children,
    infants: p.infants,
    cabin: p.cabin,
    currency: p.currency,
    preferences,
  }

  // Persist search record
  let searchDbId: string | null = null
  try {
    const rows = await withSystemContext((tx) =>
      tx
        .insert(flightSearches)
        .values({
          agencyId,
          tripType: p.tripType as "ONE_WAY" | "ROUND_TRIP" | "MULTI_CITY",
          origin: p.origin,
          destination: p.destination,
          departureDate: p.departureDate,
          returnDate: p.returnDate,
          segments: segments as unknown as Record<string, unknown> | undefined,
          adults: p.adults,
          children: p.children,
          infants: p.infants,
          cabin: p.cabin,
          currency: p.currency,
        })
        .returning({ id: flightSearches.id }),
    )
    searchDbId = (rows as Array<{ id: string }>)[0]?.id ?? null
  } catch (err) {
    console.error("[vols/search] Failed to persist search record:", err)
    // Non-fatal — search continues
  }

  // Run orchestrator
  const result = await orchestrateSearch(request)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 502 })
  }

  // Create price snapshots for each itinerary
  const offers = await Promise.all(
    result.itineraries.map(async (itinerary) => {
      try {
        const snapshot = await createPriceSnapshot({
          searchDbId,
          agencyId,
          itinerary,
          channel: "B2C",
        })
        return {
          snapshotId: snapshot.snapshotId,
          sellingAmount: snapshot.sellingAmount,
          sellingCurrency: snapshot.sellingCurrency,
          expiresAt: snapshot.expiresAt.toISOString(),
          // Canonical itinerary fields (no supplier price)
          tripType: itinerary.tripType,
          journeys: itinerary.journeys,
          fares: itinerary.fares.map((f) => ({
            passengerType: f.passengerType,
            count: f.count,
          })),
          baggage: itinerary.baggage,
          fareRules: itinerary.fareRules,
          fareBrands: itinerary.fareBrands,
          availableSeats: itinerary.availableSeats,
          provider: itinerary.provider.provider,
          // G7: ancillary catalog for this offer — client sends back only ancillaryIds
          ancillaries: itinerary.ancillaries ?? [],
        }
      } catch (err) {
        console.error("[vols/search] Failed to create snapshot:", err)
        return null
      }
    }),
  )

  const validOffers = offers.filter(Boolean)

  return NextResponse.json({
    ok: true,
    searchId: result.searchId,
    searchDbId,
    offers: validOffers,
  })
}
