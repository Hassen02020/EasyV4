/**
 * GET /api/cron/expire-pending-payments
 *
 * Wallet/Payment Core — 24h server-authoritative expiration. Toute
 * réservation `pending` dont `payment_expires_at` est dépassé passe
 * `expired` (terminal — voir lib/admin/reservation-status.ts : plus aucune
 * transition sortante, donc plus jamais payable/validable/voucher/
 * confirmation, appliqué par la state machine partagée avec
 * `updateReservationStatus`/`verifyManualPayment`).
 *
 * Même garde `CRON_SECRET` que /api/cron/cleanup (pattern existant, pas un
 * nouveau choix de sécurité).
 */

import { NextRequest, NextResponse } from "next/server"
import { lt, and, eq, isNotNull } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations } from "@/lib/db/schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret")

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 500 })
  }

  const expired = await withSystemContext((tx) =>
    tx
      .update(reservations)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(reservations.status, "pending"),
          isNotNull(reservations.paymentExpiresAt),
          lt(reservations.paymentExpiresAt, new Date()),
        ),
      )
      .returning({ id: reservations.id, publicRef: reservations.publicRef }),
  )

  return NextResponse.json({
    ok: true,
    expired: expired.length,
    refs: expired.map((r) => r.publicRef),
    timestamp: new Date().toISOString(),
  })
}
