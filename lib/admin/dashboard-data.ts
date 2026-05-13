/**
 * Helpers de données pour le dashboard /admin.
 *
 * Stratégie : on lit en BDD via Drizzle, mais on est défensif sur les erreurs
 * (BDD non disponible, RLS qui bloque, etc.) — le dashboard ne doit JAMAIS
 * crasher à cause d'une requête, il doit montrer des valeurs neutres.
 */

import { and, count, desc, eq, gte, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { reservations, customers, auditEvents } from "@/lib/db/schema"

export type DashboardStats = {
  monthlyRevenueTnd: number
  reservationsToday: number
  apiErrors24h: number
  activeCustomers: number
}

export type RecentBooking = {
  id: string
  reference: string
  customerName: string
  module: string
  destination: string | null
  totalTnd: number
  currency: string
  status: string
  createdAt: Date
}

export type BookingsByModule = {
  module: string
  count: number
}

export type ApiErrorRecent = {
  id: string
  endpoint: string
  message: string
  createdAt: Date
}

export type DashboardData = {
  available: boolean
  stats: DashboardStats
  recentBookings: RecentBooking[]
  byModule: BookingsByModule[]
  apiErrors: ApiErrorRecent[]
}

const EMPTY: DashboardData = {
  available: false,
  stats: {
    monthlyRevenueTnd: 0,
    reservationsToday: 0,
    apiErrors24h: 0,
    activeCustomers: 0,
  },
  recentBookings: [],
  byModule: [],
  apiErrors: [],
}

export async function loadDashboardData(
  agencyId: string,
): Promise<DashboardData> {
  if (!process.env.DATABASE_URL) return EMPTY

  try {
    const db = getDb()
    const startOfMonth = new Date()
    startOfMonth.setUTCDate(1)
    startOfMonth.setUTCHours(0, 0, 0, 0)

    const startOfToday = new Date()
    startOfToday.setUTCHours(0, 0, 0, 0)

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [
      monthlyRevenueRow,
      todayCountRow,
      errorsCountRow,
      customersCountRow,
      recent,
      byModule,
      apiErrors,
    ] = await Promise.all([
      db
        .select({
          totalTnd: sql<string>`COALESCE(SUM(${reservations.tndAmount}), '0')`,
        })
        .from(reservations)
        .where(
          and(
            eq(reservations.agencyId, agencyId),
            gte(reservations.createdAt, startOfMonth),
          ),
        ),
      db
        .select({ value: count() })
        .from(reservations)
        .where(
          and(
            eq(reservations.agencyId, agencyId),
            gte(reservations.createdAt, startOfToday),
          ),
        ),
      db
        .select({ value: count() })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.agencyId, agencyId),
            eq(auditEvents.entityType, "api_error"),
            gte(auditEvents.createdAt, last24h),
          ),
        ),
      db
        .select({ value: count() })
        .from(customers)
        .where(eq(customers.agencyId, agencyId)),
      db
        .select({
          id: reservations.id,
          reference: reservations.publicRef,
          firstName: customers.firstName,
          lastName: customers.lastName,
          module: reservations.module,
          tndAmount: reservations.tndAmount,
          currency: reservations.originalCurrency,
          status: reservations.status,
          createdAt: reservations.createdAt,
        })
        .from(reservations)
        .leftJoin(customers, eq(customers.id, reservations.customerId))
        .where(eq(reservations.agencyId, agencyId))
        .orderBy(desc(reservations.createdAt))
        .limit(5),
      db
        .select({
          module: reservations.module,
          value: count(),
        })
        .from(reservations)
        .where(
          and(
            eq(reservations.agencyId, agencyId),
            gte(reservations.createdAt, startOfMonth),
          ),
        )
        .groupBy(reservations.module),
      db
        .select({
          id: auditEvents.id,
          entityId: auditEvents.entityId,
          action: auditEvents.action,
          diff: auditEvents.diff,
          createdAt: auditEvents.createdAt,
        })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.agencyId, agencyId),
            eq(auditEvents.entityType, "api_error"),
            gte(auditEvents.createdAt, last24h),
          ),
        )
        .orderBy(desc(auditEvents.createdAt))
        .limit(5),
    ])

    return {
      available: true,
      stats: {
        monthlyRevenueTnd: Number(monthlyRevenueRow[0]?.totalTnd ?? 0),
        reservationsToday: Number(todayCountRow[0]?.value ?? 0),
        apiErrors24h: Number(errorsCountRow[0]?.value ?? 0),
        activeCustomers: Number(customersCountRow[0]?.value ?? 0),
      },
      recentBookings: recent.map((r) => ({
        id: r.id,
        reference: r.reference,
        customerName:
          [r.firstName, r.lastName].filter(Boolean).join(" ") || "—",
        module: r.module,
        destination: null,
        totalTnd: Number(r.tndAmount ?? 0),
        currency: r.currency ?? "TND",
        status: r.status,
        createdAt: r.createdAt,
      })),
      byModule: byModule.map((row) => ({
        module: row.module,
        count: Number(row.value ?? 0),
      })),
      apiErrors: apiErrors.map((row) => {
        const diff = (row.diff ?? {}) as Record<string, unknown>
        const endpoint =
          typeof diff.endpoint === "string"
            ? diff.endpoint
            : row.action || row.entityId
        const message =
          typeof diff.message === "string"
            ? diff.message
            : typeof diff.error === "string"
              ? diff.error
              : "Erreur API"
        return {
          id: row.id,
          endpoint,
          message,
          createdAt: row.createdAt,
        }
      }),
    }
  } catch (error) {
    console.warn(
      "[loadDashboardData] DB error — returning empty dashboard:",
      error instanceof Error ? error.message : error,
    )
    return EMPTY
  }
}
