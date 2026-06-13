/**
 * Margin Analytics - Easy2Book V6
 *
 * Service d'analyse des marges en temps réel
 * Agrégation des données financières pour le dashboard admin
 */

import { getDb } from "@/lib/db/client"
import { eq, and, sql, gte, lte, desc } from "drizzle-orm"
import {
  reservationFinancials,
  marginRules,
  walletLedger,
  journalEntries,
  reservations,
} from "@/lib/db/schema"

/**
 * KPIs de marge pour une période donnée
 */
export interface MarginKPIs {
  period: {
    start: Date
    end: Date
  }
  
  // Chiffre d'affaires
  totalRevenue: number
  totalRevenueTnd: number
  
  // Coût d'achat
  totalCost: number
  totalCostTnd: number
  
  // Marge
  totalMargin: number
  totalMarginTnd: number
  averageMarginPercent: number
  
  // Commission
  totalCommission: number
  
  // Volume
  totalReservations: number
  confirmedReservations: number
  
  // Performance
  marginTrend: "up" | "down" | "stable"
  marginTrendPercent: number
}

/**
 * Marge par fournisseur
 */
export interface MarginBySupplier {
  supplierId: string
  supplierName: string
  totalRevenue: number
  totalMargin: number
  marginPercent: number
  reservationCount: number
}

/**
 * Marge par type de produit
 */
export interface MarginByProductType {
  productType: string
  totalRevenue: number
  totalMargin: number
  marginPercent: number
  reservationCount: number
}

/**
 * Classement des meilleures marges
 */
export interface TopMarginReservation {
  reservationId: string
  publicRef: string
  productType: string
  salePriceTnd: number
  marginAmount: number
  marginPercent: number
  createdAt: Date
}

/**
 * Récupère les KPIs de marge pour une période
 */
export async function getMarginKPIs(
  agencyId: string,
  startDate: Date,
  endDate: Date
): Promise<MarginKPIs> {
  const db = getDb()

  const results = await db
    .select({
      totalRevenue: sql<number>`SUM(sale_price_tnd)`,
      totalCost: sql<number>`SUM(supplier_price_tnd)`,
      totalMargin: sql<number>`SUM(margin_amount)`,
      totalCommission: sql<number>`SUM(commission_amount)`,
      totalReservations: sql<number>`COUNT(*)`,
    })
    .from(reservationFinancials)
    .innerJoin(reservations, eq(reservationFinancials.reservationId, reservations.id))
    .where(
      and(
        eq(reservations.agencyId, agencyId),
        gte(reservations.createdAt, startDate),
        lte(reservations.createdAt, endDate),
        eq(reservations.status, "confirmed")
      )
    )

  const data = results[0] || {
    totalRevenue: 0,
    totalCost: 0,
    totalMargin: 0,
    totalCommission: 0,
    totalReservations: 0,
  }

  const totalRevenue = Number(data.totalRevenue) || 0
  const totalCost = Number(data.totalCost) || 0
  const totalMargin = Number(data.totalMargin) || 0
  const totalCommission = Number(data.totalCommission) || 0
  const totalReservations = Number(data.totalReservations) || 0

  const averageMarginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0

  // Calculer la tendance par rapport à la période précédente
  const previousPeriodStart = new Date(
    startDate.getTime() - (endDate.getTime() - startDate.getTime())
  )
  const previousPeriodEnd = startDate

  const previousResults = await db
    .select({
      totalMargin: sql<number>`SUM(margin_amount)`,
    })
    .from(reservationFinancials)
    .innerJoin(reservations, eq(reservationFinancials.reservationId, reservations.id))
    .where(
      and(
        eq(reservations.agencyId, agencyId),
        gte(reservations.createdAt, previousPeriodStart),
        lte(reservations.createdAt, previousPeriodEnd),
        eq(reservations.status, "confirmed")
      )
    )

  const previousMargin = Number(previousResults[0]?.totalMargin) || 0
  const marginTrendPercent =
    previousMargin > 0 ? ((totalMargin - previousMargin) / previousMargin) * 100 : 0

  const marginTrend =
    marginTrendPercent > 5 ? "up" : marginTrendPercent < -5 ? "down" : "stable"

  return {
    period: {
      start: startDate,
      end: endDate,
    },
    totalRevenue,
    totalRevenueTnd: totalRevenue,
    totalCost,
    totalCostTnd: totalCost,
    totalMargin,
    totalMarginTnd: totalMargin,
    averageMarginPercent,
    totalCommission,
    totalReservations,
    confirmedReservations: totalReservations,
    marginTrend,
    marginTrendPercent,
  }
}

/**
 * Récupère les marges par fournisseur
 */
export async function getMarginBySupplier(
  agencyId: string,
  startDate: Date,
  endDate: Date
): Promise<MarginBySupplier[]> {
  const db = getDb()

  const results = await db
    .select({
      supplierId: reservationFinancials.marginRuleId,
      totalRevenue: sql<number>`SUM(sale_price_tnd)`,
      totalMargin: sql<number>`SUM(margin_amount)`,
      reservationCount: sql<number>`COUNT(*)`,
    })
    .from(reservationFinancials)
    .innerJoin(reservations, eq(reservationFinancials.reservationId, reservations.id))
    .where(
      and(
        eq(reservations.agencyId, agencyId),
        gte(reservations.createdAt, startDate),
        lte(reservations.createdAt, endDate),
        eq(reservations.status, "confirmed")
      )
    )
    .groupBy(reservationFinancials.marginRuleId)
    .orderBy(desc(sql`SUM(margin_amount)`))

  return results.map((row) => ({
    supplierId: row.supplierId || "unknown",
    supplierName: row.supplierId || "Non défini",
    totalRevenue: Number(row.totalRevenue) || 0,
    totalMargin: Number(row.totalMargin) || 0,
    marginPercent:
      Number(row.totalRevenue) > 0
        ? (Number(row.totalMargin) / Number(row.totalRevenue)) * 100
        : 0,
    reservationCount: Number(row.reservationCount) || 0,
  }))
}

/**
 * Récupère les marges par type de produit
 */
export async function getMarginByProductType(
  agencyId: string,
  startDate: Date,
  endDate: Date
): Promise<MarginByProductType[]> {
  const db = getDb()

  const results = await db
    .select({
      productType: reservations.module,
      totalRevenue: sql<number>`SUM(sale_price_tnd)`,
      totalMargin: sql<number>`SUM(margin_amount)`,
      reservationCount: sql<number>`COUNT(*)`,
    })
    .from(reservationFinancials)
    .innerJoin(reservations, eq(reservationFinancials.reservationId, reservations.id))
    .where(
      and(
        eq(reservations.agencyId, agencyId),
        gte(reservations.createdAt, startDate),
        lte(reservations.createdAt, endDate),
        eq(reservations.status, "confirmed")
      )
    )
    .groupBy(reservations.module)
    .orderBy(desc(sql`SUM(margin_amount)`))

  return results.map((row) => ({
    productType: row.productType,
    totalRevenue: Number(row.totalRevenue) || 0,
    totalMargin: Number(row.totalMargin) || 0,
    marginPercent:
      Number(row.totalRevenue) > 0
        ? (Number(row.totalMargin) / Number(row.totalRevenue)) * 100
        : 0,
    reservationCount: Number(row.reservationCount) || 0,
  }))
}

/**
 * Récupère les réservations avec les meilleures marges
 */
export async function getTopMarginReservations(
  agencyId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 10
): Promise<TopMarginReservation[]> {
  const db = getDb()

  const results = await db
    .select({
      reservationId: reservationFinancials.reservationId,
      publicRef: reservations.publicRef,
      productType: reservations.module,
      salePriceTnd: reservationFinancials.salePriceTnd,
      marginAmount: reservationFinancials.marginAmount,
      marginPercent: reservationFinancials.marginPercent,
      createdAt: reservations.createdAt,
    })
    .from(reservationFinancials)
    .innerJoin(reservations, eq(reservationFinancials.reservationId, reservations.id))
    .where(
      and(
        eq(reservations.agencyId, agencyId),
        gte(reservations.createdAt, startDate),
        lte(reservations.createdAt, endDate),
        eq(reservations.status, "confirmed")
      )
    )
    .orderBy(desc(reservationFinancials.marginAmount))
    .limit(limit)

  return results.map((row) => ({
    reservationId: row.reservationId,
    publicRef: row.publicRef,
    productType: row.productType,
    salePriceTnd: Number(row.salePriceTnd) || 0,
    marginAmount: Number(row.marginAmount) || 0,
    marginPercent: Number(row.marginPercent) || 0,
    createdAt: row.createdAt,
  }))
}

/**
 * Récupère l'évolution des marges dans le temps (par jour)
 */
export async function getMarginEvolution(
  agencyId: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{ date: string; margin: number; revenue: number }>> {
  const db = getDb()

  const results = await db
    .select({
      date: sql<string>`DATE(reservations.created_at)`,
      margin: sql<number>`SUM(margin_amount)`,
      revenue: sql<number>`SUM(sale_price_tnd)`,
    })
    .from(reservationFinancials)
    .innerJoin(reservations, eq(reservationFinancials.reservationId, reservations.id))
    .where(
      and(
        eq(reservations.agencyId, agencyId),
        gte(reservations.createdAt, startDate),
        lte(reservations.createdAt, endDate),
        eq(reservations.status, "confirmed")
      )
    )
    .groupBy(sql`DATE(reservations.created_at)`)
    .orderBy(sql`DATE(reservations.created_at)`)

  return results.map((row) => ({
    date: row.date,
    margin: Number(row.margin) || 0,
    revenue: Number(row.revenue) || 0,
  }))
}

/**
 * Récupère les règles de marge actives d'une agence
 */
export async function getActiveMarginRules(agencyId: string) {
  const db = getDb()
  const now = new Date()

  return db.query.marginRules.findMany({
    where: and(
      eq(marginRules.agencyId, agencyId),
      eq(marginRules.isActive, true),
      sql`(${marginRules.validFrom} IS NULL OR ${marginRules.validFrom} <= ${now})`,
      sql`(${marginRules.validTo} IS NULL OR ${marginRules.validTo} >= ${now})`
    ),
    orderBy: (marginRules, { desc }) => [desc(marginRules.priority)],
  })
}

/**
 * Récupère les transactions wallet récentes
 */
export async function getRecentWalletTransactions(
  agencyId: string,
  limit: number = 20
) {
  const db = getDb()

  return db.query.walletLedger.findMany({
    where: eq(walletLedger.walletAccountId, agencyId),
    orderBy: (walletLedger, { desc }) => [desc(walletLedger.createdAt)],
    limit,
  })
}
