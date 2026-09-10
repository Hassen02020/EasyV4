/**
 * Données réelles pour /admin/accounting (Phase 18) — remplace les
 * tableaux `MOCK_PAYMENTS`/`MOCK_INVOICES`/stats fabriqués. Même stratégie
 * défensive que lib/admin/dashboard-data.ts : jamais de crash, valeurs
 * neutres si la BDD est indisponible.
 */

import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { customers, partnerInvoices, payments, reservations } from "@/lib/db/schema"

export type AccountingStats = {
  revenueTodayTnd: number
  revenueMonthTnd: number
  pendingPaymentsTnd: number
  totalInvoices: number
}

export type RecentPaymentRow = {
  id: string
  publicRef: string
  customerName: string
  tndAmount: number
  method: string
  status: string
  capturedAt: string | null
}

export type MonthlyRevenueRow = {
  monthLabel: string
  revenueTnd: number
  paymentsCount: number
}

const EMPTY_STATS: AccountingStats = {
  revenueTodayTnd: 0,
  revenueMonthTnd: 0,
  pendingPaymentsTnd: 0,
  totalInvoices: 0,
}

/** Scope : `agencyId: null` + `isSuperAdmin: true` = toutes agences (super_admin). */
export async function loadAccountingStats(
  agencyId: string | null,
  isSuperAdmin: boolean,
): Promise<AccountingStats> {
  if (!process.env.DATABASE_URL) return EMPTY_STATS

  try {
    const startOfMonth = new Date()
    startOfMonth.setUTCDate(1)
    startOfMonth.setUTCHours(0, 0, 0, 0)
    const startOfToday = new Date()
    startOfToday.setUTCHours(0, 0, 0, 0)

    const agencyFilter = agencyId ? eq(payments.agencyId, agencyId) : undefined
    const reservationAgencyFilter = agencyId ? eq(reservations.agencyId, agencyId) : undefined
    const invoiceAgencyFilter = agencyId ? eq(partnerInvoices.agencyId, agencyId) : undefined

    const [todayRow, monthRow, pendingRow, invoicesRow] = await withTenantContext(
      { agencyId, userId: "", isSuperAdmin },
      (db) =>
        Promise.all([
          db
            .select({ total: sql<string>`COALESCE(SUM(${payments.tndAmount} - ${payments.refundedAmount}), '0')` })
            .from(payments)
            .where(
              and(
                agencyFilter,
                eq(payments.status, "captured"),
                gte(payments.capturedAt, startOfToday),
              ),
            ),
          db
            .select({ total: sql<string>`COALESCE(SUM(${payments.tndAmount} - ${payments.refundedAmount}), '0')` })
            .from(payments)
            .where(
              and(
                agencyFilter,
                inArray(payments.status, ["captured", "partial_refund"]),
                gte(payments.capturedAt, startOfMonth),
              ),
            ),
          db
            .select({ total: sql<string>`COALESCE(SUM(${reservations.tndAmount}), '0')` })
            .from(reservations)
            .where(and(reservationAgencyFilter, eq(reservations.status, "pending"))),
          db.select({ value: count() }).from(partnerInvoices).where(invoiceAgencyFilter),
        ]),
    )

    return {
      revenueTodayTnd: Number.parseFloat(todayRow[0]?.total ?? "0"),
      revenueMonthTnd: Number.parseFloat(monthRow[0]?.total ?? "0"),
      pendingPaymentsTnd: Number.parseFloat(pendingRow[0]?.total ?? "0"),
      totalInvoices: invoicesRow[0]?.value ?? 0,
    }
  } catch {
    return EMPTY_STATS
  }
}

export async function loadRecentPayments(
  agencyId: string | null,
  isSuperAdmin: boolean,
  limit = 10,
): Promise<RecentPaymentRow[]> {
  if (!process.env.DATABASE_URL) return []

  try {
    const agencyFilter = agencyId ? eq(payments.agencyId, agencyId) : undefined

    const rows = await withTenantContext({ agencyId, userId: "", isSuperAdmin }, (db) =>
      db
        .select({
          id: payments.id,
          publicRef: reservations.publicRef,
          firstName: customers.firstName,
          lastName: customers.lastName,
          tndAmount: payments.tndAmount,
          method: payments.method,
          status: payments.status,
          capturedAt: payments.capturedAt,
        })
        .from(payments)
        .innerJoin(reservations, eq(reservations.id, payments.reservationId))
        .leftJoin(customers, eq(customers.id, reservations.customerId))
        .where(and(agencyFilter, inArray(payments.status, ["captured", "partial_refund", "refunded"])))
        .orderBy(desc(payments.capturedAt))
        .limit(limit),
    )

    return rows.map((r) => ({
      id: r.id,
      publicRef: r.publicRef,
      customerName: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "—",
      tndAmount: Number.parseFloat(r.tndAmount),
      method: r.method,
      status: r.status,
      capturedAt: r.capturedAt ? r.capturedAt.toISOString() : null,
    }))
  } catch {
    return []
  }
}

/** Chiffre d'affaires réel des 3 derniers mois — remplace les liens de "rapports" fictifs. */
export async function loadMonthlyRevenueReport(
  agencyId: string | null,
  isSuperAdmin: boolean,
): Promise<MonthlyRevenueRow[]> {
  if (!process.env.DATABASE_URL) return []

  try {
    const agencyFilter = agencyId ? eq(payments.agencyId, agencyId) : undefined

    const rows = await withTenantContext({ agencyId, userId: "", isSuperAdmin }, (db) =>
      db
        .select({
          monthStart: sql<string>`date_trunc('month', ${payments.capturedAt})`,
          revenueTnd: sql<string>`COALESCE(SUM(${payments.tndAmount} - ${payments.refundedAmount}), '0')`,
          paymentsCount: count(),
        })
        .from(payments)
        .where(
          and(
            agencyFilter,
            inArray(payments.status, ["captured", "partial_refund"]),
            gte(payments.capturedAt, sql`date_trunc('month', now()) - interval '2 months'`),
          ),
        )
        .groupBy(sql`date_trunc('month', ${payments.capturedAt})`)
        .orderBy(sql`date_trunc('month', ${payments.capturedAt}) desc`),
    )

    return rows.map((r) => ({
      monthLabel: new Date(r.monthStart).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      revenueTnd: Number.parseFloat(r.revenueTnd),
      paymentsCount: r.paymentsCount,
    }))
  } catch {
    return []
  }
}
