/**
 * GET /api/hotels-monde/search
 * Recherche hôtels monde via lib/hotels-monde/client.ts
 *
 * Route publique (B2C), même pattern que /api/vols/search : le formulaire
 * `WorldHotelSearch` est accessible sans session, aucun champ prix/marge/
 * agence/wallet dans le schéma ci-dessous — rien à protéger derrière une
 * session ici.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { searchWorldHotels } from "@/lib/hotels-monde/client"
import { destinationByValue } from "@/lib/hotels-monde/search-state"
import { rateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const revalidate = 0

const SearchSchema = z.object({
  destination: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(20).default(2),
  rooms: z.coerce.number().int().min(1).max(5).default(1),
  stars: z.coerce.number().int().min(1).max(5).optional(),
})

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "anon"
  const rl = await rateLimit(`hotels-monde:search:${ip}`)
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

  const destination = destinationByValue(parsed.data.destination)
  if (!destination) {
    return NextResponse.json({ error: "Destination inconnue" }, { status: 400 })
  }
  if (parsed.data.checkOut <= parsed.data.checkIn) {
    return NextResponse.json(
      { error: "La date de départ doit être après la date d'arrivée" },
      { status: 400 },
    )
  }

  const nights = Math.round(
    (new Date(parsed.data.checkOut).getTime() - new Date(parsed.data.checkIn).getTime()) /
      86_400_000,
  )

  const result = await searchWorldHotels({
    destination: parsed.data.destination,
    checkIn: parsed.data.checkIn,
    checkOut: parsed.data.checkOut,
    nights,
    adults: parsed.data.adults,
    rooms: parsed.data.rooms,
    stars: parsed.data.stars,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json(result)
}
