/**
 * Chargement des réservations pour la Data Table /admin/reservations.
 *
 * Retourne TOUTES les colonnes nécessaires à l'affichage + filtrage côté
 * client. Le filtrage / tri / pagination se fait côté client via shadcn
 * (volume max prévu : ~500 lignes pour une agence moyenne, on ne paginate
 * pas serveur tant que c'est < 1000).
 */

import { and, desc, eq, lt, or } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { customers, reservations } from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Cursor-based pagination helpers                                            */
/* -------------------------------------------------------------------------- */

export interface Cursor {
  createdAt: string
  id: string
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

export function decodeCursor(str: string): Cursor | null {
  try {
    const json = Buffer.from(str, "base64url").toString("utf8")
    const parsed = JSON.parse(json)
    if (
      parsed &&
      typeof parsed.createdAt === "string" &&
      typeof parsed.id === "string"
    ) {
      return parsed as Cursor
    }
    return null
  } catch {
    return null
  }
}

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

export type CursorPageResult = {
  available: boolean
  rows: AdminReservationRow[]
  nextCursor: string | null
  hasMore: boolean
}

const EMPTY: AdminReservationsData = { available: false, rows: [] }
const EMPTY_PAGE: CursorPageResult = {
  available: false,
  rows: [],
  nextCursor: null,
  hasMore: false,
}

/* -------------------------------------------------------------------------- */
/* Legacy loader (kept for dashboard compatibility)                         */
/* -------------------------------------------------------------------------- */

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
      rows: rows.map(mapRow),
    }
  } catch (error) {
    console.error("loadAdminReservations failed:", error)
    return EMPTY
  }
}

/* -------------------------------------------------------------------------- */
/* Cursor-based paginated loader                                              */
/* -------------------------------------------------------------------------- */

export async function loadAdminReservationsPage(
  agencyId: string,
  limit = 25,
  cursor?: Cursor | null,
): Promise<CursorPageResult> {
  if (!process.env.DATABASE_URL) return EMPTY_PAGE

  try {
    const db = getDb()

    const base = eq(reservations.agencyId, agencyId)
    const where = cursor
      ? and(
          base,
          or(
            lt(reservations.createdAt, new Date(cursor.createdAt)),
            and(
              eq(reservations.createdAt, new Date(cursor.createdAt)),
              lt(reservations.id, cursor.id),
            ),
          ),
        )
      : base

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
      .where(where!)
      .orderBy(desc(reservations.createdAt))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const lastRow = pageRows[pageRows.length - 1]

    const nextCursor: string | null =
      hasMore && lastRow
        ? encodeCursor({
            createdAt: lastRow.createdAt.toISOString(),
            id: lastRow.id,
          })
        : null

    return {
      available: true,
      rows: pageRows.map(mapRow),
      nextCursor,
      hasMore,
    }
  } catch (error) {
    console.error("loadAdminReservationsPage failed:", error)
    return EMPTY_PAGE
  }
}

/* -------------------------------------------------------------------------- */
/* Row mapper                                                                 */
/* -------------------------------------------------------------------------- */

function mapRow(row: {
  id: string
  publicRef: string
  module: string
  status: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  originalCurrency: string
  originalAmount: string | null
  tndAmount: string | null
  depositAmount: string | null
  depositPaid: string | null
  createdAt: Date
  cancelledAt: Date | null
}): AdminReservationRow {
  return {
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
  }
}
