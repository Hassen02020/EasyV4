/**
 * GET /api/vols/search
 * Recherche de vols via le client lib/vols/client.ts
 *
 * Route publique (B2C) — corrigé lors de la reconstruction du Results
 * Journey Vols (voir EASYV4_SEARCH_ENGINES_AUDIT_REPORT.md) : cette route
 * exigeait `requirePartnerSession`, alors que sa seule utilisation réelle
 * est le widget de recherche public de la homepage (`components/
 * booking-engine.tsx` → `/vols` → `/vols/search`) — même bug de classe que
 * celui déjà trouvé et corrigé sur `/api/hotels/search` cette session (voir
 * EASYV4_B2C_PUBLIC_SEARCH_REPORT.md) : un visiteur anonyme tombait
 * systématiquement sur une erreur de session au lieu de résultats. Le
 * schéma de requête ci-dessous n'accepte aucun champ prix/marge/agence/
 * wallet — rien à protéger derrière une session ici.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { searchFlights } from "@/lib/vols/client"
import { rateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const revalidate = 0

const SearchSchema = z.object({
  origin: z.string().min(3).max(3).toUpperCase(),
  destination: z.string().min(3).max(3).toUpperCase(),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  adults: z.coerce.number().int().min(1).max(9).default(1),
  children: z.coerce.number().int().min(0).max(8).default(0),
  cabin: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]).optional(),
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

  const result = await searchFlights({
    originCode: parsed.data.origin,
    destinationCode: parsed.data.destination,
    departureDate: parsed.data.departureDate,
    returnDate: parsed.data.returnDate,
    adults: parsed.data.adults,
    children: parsed.data.children || undefined,
    cabin: parsed.data.cabin,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json(result)
}
