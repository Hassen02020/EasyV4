/**
 * Chargement du détail d'une réservation par référence publique.
 *
 * Utilisé par la page de confirmation /pro/booking/confirmation/[ref].
 * Scoped sur agencyId depuis la session — jamais d'accès cross-tenant.
 */

import { and, eq } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { customers, reservations, reservationHotel } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

export type ReservationDetail = {
  id: string
  publicRef: string
  module: string
  status: string
  totalTnd: number
  customerName: string
  customerEmail: string | null
  hotelName: string | null
  checkIn: string | null
  checkOut: string | null
  nights: number | null
  createdAt: string
}

export async function loadReservationByRef(
  publicRef: string,
  agencyId: string,
): Promise<ReservationDetail | null> {
  if (!process.env.DATABASE_URL) return null

  try {
    const db = getDb()

    const rows = await db
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        module: reservations.module,
        status: reservations.status,
        tndAmount: reservations.tndAmount,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        hotelName: reservationHotel.hotelName,
        checkIn: reservationHotel.checkIn,
        checkOut: reservationHotel.checkOut,
        nights: reservationHotel.nights,
        createdAt: reservations.createdAt,
      })
      .from(reservations)
      .leftJoin(customers, eq(customers.id, reservations.customerId))
      .leftJoin(
        reservationHotel,
        eq(reservationHotel.reservationId, reservations.id),
      )
      .where(
        and(
          eq(reservations.publicRef, publicRef),
          eq(reservations.agencyId, agencyId),
        ),
      )
      .limit(1)

    const row = rows[0]
    if (!row) return null

    return {
      id: row.id,
      publicRef: row.publicRef,
      module: row.module,
      status: row.status,
      totalTnd: parseFloat((row.tndAmount as string | null) ?? "0"),
      customerName:
        [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "—",
      customerEmail: row.email,
      hotelName: row.hotelName ?? null,
      checkIn: row.checkIn ?? null,
      checkOut: row.checkOut ?? null,
      nights: row.nights ?? null,
      createdAt: row.createdAt.toISOString(),
    }
  } catch (err) {
    logger.error("loadReservationByRef failed", {
      publicRef,
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
