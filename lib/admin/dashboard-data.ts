/**
 * Helpers de données pour le dashboard /admin.
 *
 * Stratégie : on lit en BDD via Drizzle, mais on est défensif sur les erreurs
 * (BDD non disponible, RLS qui bloque, etc.) — le dashboard ne doit JAMAIS
 * crasher à cause d'une requête, il doit montrer des valeurs neutres.
 */

import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { reservations, customers, auditEvents, payments } from "@/lib/db/schema"

/**
 * DASHBOARD-REVENUE-TRUTH-01 (2026-11-10, décision propriétaire : option C).
 * L'ancien « Chiffre d'Affaires » additionnait le montant de TOUTES les
 * réservations créées dans le mois, annulées/expirées/jamais payées
 * comprises (novembre : 103,21 TND = une réservation annulée non payée).
 * Remplacé par deux indicateurs distincts :
 *  - monthlyCollectedTnd : argent réellement reçu ce mois (paiements
 *    captured / partial_refund, nets des remboursements) — même calcul que
 *    la page Comptabilité (lib/admin/accounting-data.ts) ;
 *  - monthlyConfirmedSalesTnd : montant des réservations confirmées ou
 *    terminées créées ce mois.
 */
export type DashboardStats = {
  monthlyCollectedTnd: number
  monthlyConfirmedSalesTnd: number
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
    monthlyCollectedTnd: 0,
    monthlyConfirmedSalesTnd: 0,
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
    const startOfMonth = new Date()
    startOfMonth.setUTCDate(1)
    startOfMonth.setUTCHours(0, 0, 0, 0)

    const startOfToday = new Date()
    startOfToday.setUTCHours(0, 0, 0, 0)

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [
      monthlyCollectedRow,
      monthlyConfirmedRow,
      todayCountRow,
      errorsCountRow,
      customersCountRow,
      recent,
      byModule,
      apiErrors,
    ] = await withTenantContext(
      { agencyId, userId: "", isSuperAdmin: false },
      (db) =>
        Promise.all([
          db
            .select({
              totalTnd: sql<string>`COALESCE(SUM(${payments.tndAmount} - ${payments.refundedAmount}), '0')`,
            })
            .from(payments)
            .where(
              and(
                eq(payments.agencyId, agencyId),
                inArray(payments.status, ["captured", "partial_refund"]),
                gte(payments.capturedAt, startOfMonth),
              ),
            ),
          db
            .select({
              totalTnd: sql<string>`COALESCE(SUM(${reservations.tndAmount}), '0')`,
            })
            .from(reservations)
            .where(
              and(
                eq(reservations.agencyId, agencyId),
                inArray(reservations.status, ["confirmed", "completed"]),
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
        ]),
    )

    return {
      available: true,
      stats: {
        monthlyCollectedTnd: Number(monthlyCollectedRow[0]?.totalTnd ?? 0),
        monthlyConfirmedSalesTnd: Number(monthlyConfirmedRow[0]?.totalTnd ?? 0),
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
    const { logger } = await import("@/lib/logger")
    logger.warn("[loadDashboardData] DB error — returning empty dashboard", {
      code: error instanceof Error ? error.constructor.name : "unknown",
    })
    return EMPTY
  }
}
