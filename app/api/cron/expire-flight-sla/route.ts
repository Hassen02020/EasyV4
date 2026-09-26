/**
 * GET /api/cron/expire-flight-sla
 *
 * SLA enforcement — expire PENDING flight booking requests whose 15-minute
 * ticketing-desk window has passed without being picked up. Transitions:
 *   flight_bookings  : PENDING + slaDeadline < now()  → CANCELLED
 *   reservations     : pending (flight, corresponding)  → expired
 *
 * Run hourly. On Vercel Pro a 15-minute schedule is feasible; hourly is
 * conservative and correct (bookings expire at most ~1 h after SLA passes).
 *
 * Same CRON_SECRET guard as every other cron in this project.
 */

import { NextRequest, NextResponse } from "next/server"
import { lt, and, eq, inArray, isNotNull } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations } from "@/lib/db/schema"
import { flightBookings } from "@/lib/db/schema/flights"

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
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 500 })
  }

  const { cancelledBookings, expiredReservations } = await withSystemContext(async (tx) => {
    // Cancel PENDING flight bookings whose SLA window has closed
    const cancelledRows = await tx
      .update(flightBookings)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(
        and(
          eq(flightBookings.status, "PENDING"),
          isNotNull(flightBookings.slaDeadline),
          lt(flightBookings.slaDeadline, new Date()),
        ),
      )
      .returning({
        id: flightBookings.id,
        reservationId: flightBookings.reservationId,
      })

    // Expire the corresponding reservations atomically
    const reservationIds = cancelledRows
      .map((b) => b.reservationId)
      .filter((id): id is string => id !== null)

    const expiredRows =
      reservationIds.length > 0
        ? await tx
            .update(reservations)
            .set({ status: "expired", updatedAt: new Date() })
            .where(
              and(
                inArray(reservations.id, reservationIds),
                eq(reservations.status, "pending"),
              ),
            )
            .returning({ id: reservations.id, publicRef: reservations.publicRef })
        : []

    return { cancelledBookings: cancelledRows.length, expiredReservations: expiredRows }
  })

  return NextResponse.json({
    ok: true,
    cancelledBookings,
    expiredReservations: expiredReservations.length,
    refs: expiredReservations.map((r) => r.publicRef),
    timestamp: new Date().toISOString(),
  })
}
