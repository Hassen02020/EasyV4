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
import { lt, and, eq, isNotNull, inArray } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations, payments } from "@/lib/db/schema"

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

  const { expired, paymentsFailed } = await withSystemContext(async (tx) => {
    const expiredRows = await tx
      .update(reservations)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(reservations.status, "pending"),
          isNotNull(reservations.paymentExpiresAt),
          lt(reservations.paymentExpiresAt, new Date()),
        ),
      )
      .returning({ id: reservations.id, publicRef: reservations.publicRef })

    // Cohérence paiement ↔ réservation (Paiement B2C réel) : une ligne
    // `payments` PENDING (paiement en ligne carte en attente du webhook)
    // rattachée à une réservation qui vient d'expirer ne doit jamais rester
    // "pending" indéfiniment — un webhook tardif serait de toute façon déjà
    // rejeté par isTransitionAllowed côté réservation, mais laisser le
    // paiement lui-même "pending" fausserait tout rapport staff. transfer/
    // cash : leur `payments` PENDING reste correctement "pending" jusqu'à
    // verifyManualPayment (comportement historique inchangé, ce cron ne les
    // capture jamais — capturé UNIQUEMENT via règlement manuel constaté),
    // donc filtré ici sur method='card' pour ne toucher QUE le paiement en
    // ligne redirect-based expiré.
    const reservationIds = expiredRows.map((r) => r.id)
    const failedPayments =
      reservationIds.length > 0
        ? await tx
            .update(payments)
            .set({ status: "failed" })
            .where(
              and(
                inArray(payments.reservationId, reservationIds),
                eq(payments.status, "pending"),
                eq(payments.method, "card"),
              ),
            )
            .returning({ id: payments.id })
        : []

    return { expired: expiredRows, paymentsFailed: failedPayments.length }
  })

  return NextResponse.json({
    ok: true,
    expired: expired.length,
    paymentsFailed,
    refs: expired.map((r) => r.publicRef),
    timestamp: new Date().toISOString(),
  })
}
