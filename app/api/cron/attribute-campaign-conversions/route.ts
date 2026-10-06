/**
 * GET /api/cron/attribute-campaign-conversions
 *
 * CAMPAIGN-ATTRIBUTION-01 — balaie périodiquement les réservations
 * 'confirmed'/'completed' sans attribution encore calculée et écrit le
 * lien stable (campaign_attributions) quand un CONTACT ciblé par une
 * campagne encore éligible correspond. BOOKING n'est jamais modifié
 * par ce job — lecture seule sur reservations/customers.
 *
 * Choix du cron plutôt que les événements Inngest `booking/*.confirmed`
 * existants : ces événements ne couvrent que 4 modules sur 8 (hotel/
 * flight/transfer/omra — packages/activities/cars/network n'émettent
 * rien). Un cron balayant `reservations` directement couvre tous les
 * modules uniformément, décision explicite de l'utilisateur (2026-10-06).
 *
 * Même garde `CRON_SECRET` que les autres crons de ce dépôt (pattern
 * existant, pas un nouveau choix de sécurité).
 */

import { NextRequest, NextResponse } from "next/server"
import { withSystemContext } from "@/lib/db/tenant-context"
import { attributeNewReservationsCore } from "@/lib/crm/campaign-attribution-core"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "")
  const secret =
    bearer ??
    req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("secret")

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Base de données non configurée" },
      { status: 500 },
    )
  }

  const result = await withSystemContext((tx) =>
    attributeNewReservationsCore(tx),
  )

  return NextResponse.json({
    ok: true,
    ...result,
    timestamp: new Date().toISOString(),
  })
}
