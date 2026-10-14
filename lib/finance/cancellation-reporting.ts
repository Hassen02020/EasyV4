/**
 * Synthèse financière des annulations — lecture seule.
 *
 * Requête sur `reservation_financials` (colonnes cancellation_fee /
 * refund_amount / cancelled_at) + JOIN `reservations` (module, status).
 * Aucune écriture, aucune migration requise — données déjà présentes
 * depuis ADMIN-CANCEL-FINANCIALS-01 (PR #198).
 *
 * Utilise `withSystemContext` (super-admin RLS bypass) — réservé à l'usage
 * admin interne ; NE PAS exposer dans un Server Action sans vérification de
 * session admin.
 */

import { and, isNotNull, gte, sql } from "drizzle-orm"
import { reservationFinancials, reservations } from "@/lib/db/schema"
import { withSystemContext } from "@/lib/db/tenant-context"

export interface CancellationModuleRow {
  module: string
  count: number
  totalFees: number
  totalRefunded: number
}

export interface CancellationDayRow {
  day: string
  count: number
  fees: number
  refunded: number
}

export interface CancellationFinancialsSummary {
  /** Fenêtre d'observation (90 jours glissants). */
  windowDays: number
  /** Nombre total d'annulations avec données financières. */
  totalCancellations: number
  /** Somme des frais retenus (TND). */
  totalFeesTnd: number
  /** Somme des remboursements effectués (TND). */
  totalRefundedTnd: number
  /** Détail par module. */
  byModule: CancellationModuleRow[]
  /** Tendance journalière (triée chronologiquement). */
  dailyTrend: CancellationDayRow[]
}

/** Durée de la fenêtre d'analyse — 90 jours glissants. */
const WINDOW_DAYS = 90

export async function getCancellationFinancialsSummary(): Promise<CancellationFinancialsSummary> {
  return withSystemContext(async (tx) => {
    const since = new Date()
    since.setDate(since.getDate() - WINDOW_DAYS)

    const baseFilter = and(
      isNotNull(reservationFinancials.cancellationFee),
      gte(reservationFinancials.cancelledAt, since),
    )

    /* ── KPIs globaux ─────────────────────────────────────────── */
    const [totals] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        fees: sql<number>`coalesce(sum(${reservationFinancials.cancellationFee}::numeric), 0)`,
        refunded: sql<number>`coalesce(sum(${reservationFinancials.refundAmount}::numeric), 0)`,
      })
      .from(reservationFinancials)
      .where(baseFilter)

    /* ── Répartition par module ──────────────────────────────── */
    const byModuleRows = await tx
      .select({
        module: reservations.module,
        count: sql<number>`count(*)::int`,
        fees: sql<number>`coalesce(sum(${reservationFinancials.cancellationFee}::numeric), 0)`,
        refunded: sql<number>`coalesce(sum(${reservationFinancials.refundAmount}::numeric), 0)`,
      })
      .from(reservationFinancials)
      .innerJoin(
        reservations,
        sql`${reservationFinancials.reservationId} = ${reservations.id}`,
      )
      .where(baseFilter)
      .groupBy(reservations.module)
      .orderBy(
        sql`sum(${reservationFinancials.cancellationFee}::numeric) desc nulls last`,
      )

    /* ── Tendance journalière ─────────────────────────────────── */
    const dailyRows = await tx
      .select({
        day: sql<string>`date_trunc('day', ${reservationFinancials.cancelledAt})::date::text`,
        count: sql<number>`count(*)::int`,
        fees: sql<number>`coalesce(sum(${reservationFinancials.cancellationFee}::numeric), 0)`,
        refunded: sql<number>`coalesce(sum(${reservationFinancials.refundAmount}::numeric), 0)`,
      })
      .from(reservationFinancials)
      .where(baseFilter)
      .groupBy(sql`date_trunc('day', ${reservationFinancials.cancelledAt})`)
      .orderBy(sql`date_trunc('day', ${reservationFinancials.cancelledAt}) asc`)

    return {
      windowDays: WINDOW_DAYS,
      totalCancellations: totals?.count ?? 0,
      totalFeesTnd: Number(totals?.fees ?? 0),
      totalRefundedTnd: Number(totals?.refunded ?? 0),
      byModule: byModuleRows.map((r) => ({
        module: r.module,
        count: r.count,
        totalFees: Number(r.fees),
        totalRefunded: Number(r.refunded),
      })),
      dailyTrend: dailyRows.map((r) => ({
        day: r.day,
        count: r.count,
        fees: Number(r.fees),
        refunded: Number(r.refunded),
      })),
    }
  })
}
