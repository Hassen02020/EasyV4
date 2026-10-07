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
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { getMarginsForAgency } from "@/lib/pro/server-context"
import { applyMargin } from "@/lib/pro/pricing"
import { withSystemContext } from "@/lib/db/tenant-context"
import { recordHotelSearchDemandCore } from "@/lib/crm/search-demand-core"
import { logger } from "@/lib/logger"

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
  const ip =
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "anon"
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

  const agencyId = await getDefaultAgencyId()

  // BEHAVIORAL-SIGNAL-01 — signal de demande marché agrégé (jamais un
  // historique individuel, voir lib/crm/search-demand-core.ts). Ne doit
  // JAMAIS faire échouer une vraie recherche — comptage best-effort,
  // même discipline que acquireLock (lib/booking/inventory.ts).
  try {
    if (agencyId) {
      await withSystemContext((tx) =>
        recordHotelSearchDemandCore(tx, {
          agencyId,
          destination: destination.value,
        }),
      )
    }
  } catch (err) {
    logger.warn("[search-demand] enregistrement signal échoué", {
      err: String(err),
      destination: destination.value,
    })
  }

  const nights = Math.round(
    (new Date(parsed.data.checkOut).getTime() -
      new Date(parsed.data.checkIn).getTime()) /
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

  // Marge agence — même mécanisme que app/api/hotels/search-public/route.ts
  // (getMarginsForAgency + applyMargin), jamais une deuxième formule.
  // Le prix net (totalPriceTnd) est l'unité de marge atomique — l'offre
  // Hôtels Monde n'a pas de granularité par chambre exposée (contrairement
  // à myGo), pricePerNightTnd n'est qu'une valeur d'affichage dérivée.
  const margins = await getMarginsForAgency(agencyId, undefined, "direct")
  result.offers = result.offers.map((offer) => {
    const totalPriceTnd = applyMargin(offer.totalPriceTnd, margins.hotel)
    return {
      ...offer,
      totalPriceTnd,
      pricePerNightTnd: totalPriceTnd / offer.nights,
    }
  })

  return NextResponse.json(result)
}
