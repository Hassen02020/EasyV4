/**
 * Chargement des réservations pour la Data Table /admin/reservations.
 *
 * Retourne TOUTES les colonnes nécessaires à l'affichage + filtrage côté
 * client. Le filtrage / tri / pagination se fait côté client via shadcn
 * (volume max prévu : ~500 lignes pour une agence moyenne, on ne paginate
 * pas serveur tant que c'est < 1000).
 */

import { and, desc, eq } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { customers, reservations } from "@/lib/db/schema"

export type AdminReservationRow = {
  id: string
  publicRef: string
  module: string
  status: string
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  originalCurrency: string
  originalAmount: number
  tndAmount: number
  depositAmount: number | null
  depositPaid: number
  createdAt: string
  cancelledAt: string | null
}

export type AdminReservationsData = {
  available: boolean
  rows: AdminReservationRow[]
}

const EMPTY: AdminReservationsData = { available: false, rows: [] }

export async function loadAdminReservations(
  agencyId: string,
  limit = 500,
): Promise<AdminReservationsData> {
  if (!process.env.DATABASE_URL) return EMPTY

  try {
    const db = getDb()
    const rows = await db
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        module: reservations.module,
        status: reservations.status,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        phone: customers.phone,
        originalCurrency: reservations.originalCurrency,
        originalAmount: reservations.originalAmount,
        tndAmount: reservations.tndAmount,
        depositAmount: reservations.depositAmount,
        depositPaid: reservations.depositPaid,
        createdAt: reservations.createdAt,
        cancelledAt: reservations.cancelledAt,
      })
      .from(reservations)
      .leftJoin(customers, eq(customers.id, reservations.customerId))
      .where(and(eq(reservations.agencyId, agencyId)))
      .orderBy(desc(reservations.createdAt))
      .limit(limit)

    return {
      available: true,
      rows: rows.map((row) => ({
        id: row.id,
        publicRef: row.publicRef,
        module: row.module,
        status: row.status,
        customerName:
          [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "—",
        customerEmail: row.email,
        customerPhone: row.phone,
        originalCurrency: row.originalCurrency,
        originalAmount: Number(row.originalAmount ?? 0),
        tndAmount: Number(row.tndAmount ?? 0),
        depositAmount:
          row.depositAmount === null ? null : Number(row.depositAmount),
        depositPaid: Number(row.depositPaid ?? 0),
        createdAt: row.createdAt.toISOString(),
        cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      })),
    }
  } catch (error) {
    console.error("loadAdminReservations failed:", error)
    return EMPTY
  }
}
