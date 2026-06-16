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

/** Colonnes communes sélectionnées pour le détail réservation. */
const reservationDetailColumns = {
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
}

type ReservationDetailRow = {
  id: string
  publicRef: string
  module: string
  status: string
  tndAmount: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  hotelName: string | null
  checkIn: string | null
  checkOut: string | null
  nights: number | null
  createdAt: Date
}

function mapReservationRow(row: ReservationDetailRow): ReservationDetail {
  return {
    id: row.id,
    publicRef: row.publicRef,
    module: row.module,
    status: row.status,
    totalTnd: parseFloat(row.tndAmount ?? "0"),
    customerName:
      [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "—",
    customerEmail: row.email,
    hotelName: row.hotelName ?? null,
    checkIn: row.checkIn ?? null,
    checkOut: row.checkOut ?? null,
    nights: row.nights ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function loadReservationByRef(
  publicRef: string,
  agencyId: string,
): Promise<ReservationDetail | null> {
  if (!process.env.DATABASE_URL) return null

  try {
    const db = getDb()

    const rows = await db
      .select(reservationDetailColumns)
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
    return mapReservationRow(row)
  } catch (err) {
    logger.error("loadReservationByRef failed", {
      publicRef,
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Charge le détail d'une réservation par son UUID, scopé sur l'agence
 * de la session (jamais d'accès cross-tenant). Utilisé par la page
 * /pro/reservations/[id] (redirection post-réservation B2B).
 */
export async function loadReservationById(
  id: string,
  agencyId: string,
): Promise<ReservationDetail | null> {
  if (!process.env.DATABASE_URL) return null

  try {
    const db = getDb()

    const rows = await db
      .select(reservationDetailColumns)
      .from(reservations)
      .leftJoin(customers, eq(customers.id, reservations.customerId))
      .leftJoin(
        reservationHotel,
        eq(reservationHotel.reservationId, reservations.id),
      )
      .where(
        and(eq(reservations.id, id), eq(reservations.agencyId, agencyId)),
      )
      .limit(1)

    const row = rows[0]
    if (!row) return null
    return mapReservationRow(row)
  } catch (err) {
    logger.error("loadReservationById failed", {
      id,
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
