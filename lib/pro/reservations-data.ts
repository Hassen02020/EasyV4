/**
 * Données réservations partenaire B2B — requêtes Drizzle.
 *
 * Toutes les requêtes sont scoped sur `agencyId` (multi-tenant).
 * Le `cursor` est un ISO timestamp pour la pagination par keyset.
 */

import { and, desc, eq, lt, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { reservations, customers, reservationHotel } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

/* -------------------------------------------------------------------------- */
/* Types                                                                        */
/* -------------------------------------------------------------------------- */

export type PartnerReservationRow = {
  id: string
  publicRef: string
  module: string
  status: string
  customerName: string
  customerEmail: string | null
  /** Nom du service (hôtel, …) — null si non applicable */
  serviceName: string | null
  checkin: string | null
  checkout: string | null
  tndAmount: number
  createdAt: Date
}

export type LoadPartnerReservationsResult = {
  rows: PartnerReservationRow[]
  /** Cursor ISO pour la page suivante (null si fin) */
  nextCursor: string | null
  total: number
}

/* -------------------------------------------------------------------------- */
/* Requête principale                                                           */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 20

export async function loadPartnerReservations(
  agencyId: string,
  opts: {
    cursor?: string | null
    status?: string | null
    module?: string | null
  } = {},
): Promise<LoadPartnerReservationsResult> {
  if (!process.env.DATABASE_URL) {
    return { rows: [], nextCursor: null, total: 0 }
  }

  const db = getDb()

  try {
    const where = and(
      eq(reservations.agencyId, agencyId),
      opts.status ? eq(reservations.status, opts.status as "pending") : undefined,
      opts.module ? eq(reservations.module, opts.module as "hotel") : undefined,
      opts.cursor
        ? lt(reservations.createdAt, new Date(opts.cursor))
        : undefined,
    )

    const [rows, [countRow]] = await Promise.all([
      db
        .select({
          id: reservations.id,
          publicRef: reservations.publicRef,
          module: reservations.module,
          status: reservations.status,
          tndAmount: reservations.tndAmount,
          createdAt: reservations.createdAt,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
          customerEmail: customers.email,
          hotelName: reservationHotel.hotelName,
          checkIn: reservationHotel.checkIn,
          checkOut: reservationHotel.checkOut,
        })
        .from(reservations)
        .leftJoin(customers, eq(reservations.customerId, customers.id))
        .leftJoin(
          reservationHotel,
          eq(reservationHotel.reservationId, reservations.id),
        )
        .where(where)
        .orderBy(desc(reservations.createdAt))
        .limit(PAGE_SIZE + 1),

      db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(reservations)
        .where(
          and(
            eq(reservations.agencyId, agencyId),
            opts.status
              ? eq(reservations.status, opts.status as "pending")
              : undefined,
            opts.module
              ? eq(reservations.module, opts.module as "hotel")
              : undefined,
          ),
        ),
    ])

    const hasMore = rows.length > PAGE_SIZE
    const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows
    const nextCursor = hasMore
      ? pageRows.at(-1)!.createdAt.toISOString()
      : null

    const mapped: PartnerReservationRow[] = pageRows.map((r) => ({
      id: r.id,
      publicRef: r.publicRef,
      module: r.module,
      status: r.status,
      customerName:
        [r.customerFirstName, r.customerLastName].filter(Boolean).join(" ") ||
        "—",
      customerEmail: r.customerEmail ?? null,
      serviceName: r.hotelName ?? null,
      checkin: r.checkIn ?? null,
      checkout: r.checkOut ?? null,
      tndAmount: parseFloat(r.tndAmount as string) || 0,
      createdAt: r.createdAt,
    }))

    return {
      rows: mapped,
      nextCursor,
      total: countRow?.total ?? 0,
    }
  } catch (err) {
    logger.error("[loadPartnerReservations] failed", {
      agencyId,
      err: err instanceof Error ? err.message : String(err),
    })
    return { rows: [], nextCursor: null, total: 0 }
  }
}
