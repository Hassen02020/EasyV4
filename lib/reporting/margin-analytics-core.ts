/**
 * Margin Analytics — moteur central, PAS un fichier `"use server"`.
 *
 * Extrait de lib/reporting/margin-analytics.ts (Phase 38G, gap confirmé) :
 * les 7 fonctions de ce module prenaient toutes `agencyId` en paramètre
 * simple, exportées depuis un fichier `"use server"` — donc chacune était un
 * Server Action Next.js indépendamment invocable, avec `agencyId` fourni par
 * l'appelant et AUCUNE vérification de session à l'intérieur. N'importe qui
 * pouvait appeler `getMarginKPIs("<agenceCible>", ...)` directement (contact
 * hors de la page /admin/analytics/margins, qui n'est qu'une porte d'entrée
 * parmi d'autres vers un Server Action) et lire le chiffre d'affaires, le
 * coût, la marge, la commission et le détail par réservation de N'IMPORTE
 * QUELLE agence — la garde de route `/admin/layout.tsx` (isAllowedIntoAdmin)
 * ne protège que la PAGE, jamais le Server Action lui-même.
 *
 * Même correctif que Phase 38A/27 : la logique DB reste ici, testable sans
 * session Supabase (agencyId déjà résolu passé en paramètre) ; seul le
 * wrapper `"use server"` (margin-analytics.ts) résout et fait confiance à
 * l'agencyId — jamais une valeur fournie par le client.
 */

import { withTenantContext } from "@/lib/db/tenant-context"
import { eq, and, sql, gte, lte, desc } from "drizzle-orm"
import {
  reservationFinancials,
  marginRules,
  partnerCreditMovements,
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

  // Annulations (39) — depuis reservation_financials.cancellation_fee
  cancelledCount: number
  totalCancellationFees: number
  totalRefunded: number

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
export async function getMarginKPIsCore(
  agencyId: string,
  startDate: Date,
  endDate: Date
): Promise<MarginKPIs> {
  const [results, cancellationResults, previousResults] = await withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    (db) => {
      const previousPeriodStart = new Date(
        startDate.getTime() - (endDate.getTime() - startDate.getTime())
      )
      return Promise.all([
        // KPIs réservations confirmées (non annulées)
        db
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
              eq(reservations.status, "confirmed"),
            ),
          ),

        // KPIs annulations (39) — frais retenus + remboursements effectifs
        db
          .select({
            cancelledCount: sql<number>`COUNT(*)`,
            totalCancellationFees: sql<number>`COALESCE(SUM(${reservationFinancials.cancellationFee}), 0)`,
            totalRefunded: sql<number>`COALESCE(SUM(${reservationFinancials.refundAmount}), 0)`,
          })
          .from(reservationFinancials)
          .innerJoin(reservations, eq(reservationFinancials.reservationId, reservations.id))
          .where(
            and(
              eq(reservations.agencyId, agencyId),
              gte(reservations.createdAt, startDate),
              lte(reservations.createdAt, endDate),
              eq(reservations.status, "cancelled"),
              sql`${reservationFinancials.cancelledAt} IS NOT NULL`,
            ),
          ),

        // Marge période précédente (tendance)
        db
          .select({ totalMargin: sql<number>`SUM(margin_amount)` })
          .from(reservationFinancials)
          .innerJoin(reservations, eq(reservationFinancials.reservationId, reservations.id))
          .where(
            and(
              eq(reservations.agencyId, agencyId),
              gte(reservations.createdAt, previousPeriodStart),
              lte(reservations.createdAt, startDate),
              eq(reservations.status, "confirmed"),
            ),
          ),
      ])
    },
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
  const cancelledCount = Number(cancellationResults[0]?.cancelledCount) || 0
  const totalCancellationFees = Number(cancellationResults[0]?.totalCancellationFees) || 0
  const totalRefunded = Number(cancellationResults[0]?.totalRefunded) || 0

  const averageMarginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0

  const previousMargin = Number(previousResults[0]?.totalMargin) || 0
  const marginTrendPercent =
    previousMargin > 0 ? ((totalMargin - previousMargin) / previousMargin) * 100 : 0
  const marginTrend =
    marginTrendPercent > 5 ? "up" : marginTrendPercent < -5 ? "down" : "stable"

  return {
    period: { start: startDate, end: endDate },
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
    cancelledCount,
    totalCancellationFees,
    totalRefunded,
    marginTrend,
    marginTrendPercent,
  }
}

/**
 * Récupère les marges par fournisseur.
 *
 * Note 38A : `reservation_financials.margin_rule_id` n'est pas encore
 * renseigné par le pipeline booking (getMarginsForAgency ne retourne pas
 * les IDs de règles — voir gap 38B). En attendant, on groupe par
 * `reservations.module` (même granularité que getMarginByProductTypeCore)
 * pour retourner des données exploitables plutôt que "Non défini".
 */
export async function getMarginBySupplierCore(
  agencyId: string,
  startDate: Date,
  endDate: Date
): Promise<MarginBySupplier[]> {
  const results = await withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    (db) =>
      db
        .select({
          supplierId: reservations.module,
          totalRevenue: sql<number>`SUM(${reservationFinancials.salePriceTnd})`,
          totalMargin: sql<number>`SUM(${reservationFinancials.marginAmount})`,
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
        .orderBy(desc(sql`SUM(${reservationFinancials.marginAmount})`)),
  )

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
export async function getMarginByProductTypeCore(
  agencyId: string,
  startDate: Date,
  endDate: Date
): Promise<MarginByProductType[]> {
  const results = await withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    (db) =>
      db
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
        .orderBy(desc(sql`SUM(margin_amount)`)),
  )

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
export async function getTopMarginReservationsCore(
  agencyId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 10
): Promise<TopMarginReservation[]> {
  const results = await withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    (db) =>
      db
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
        .limit(limit),
  )

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
export async function getMarginEvolutionCore(
  agencyId: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{ date: string; margin: number; revenue: number }>> {
  const results = await withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    (db) =>
      db
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
        .orderBy(sql`DATE(reservations.created_at)`),
  )

  return results.map((row) => ({
    date: row.date,
    margin: Number(row.margin) || 0,
    revenue: Number(row.revenue) || 0,
  }))
}

/**
 * Récupère les règles de marge actives d'une agence
 */
export async function getActiveMarginRulesCore(agencyId: string) {
  const now = new Date()

  return withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    (db) =>
      db.query.marginRules.findMany({
        where: and(
          eq(marginRules.agencyId, agencyId),
          eq(marginRules.isActive, true),
          sql`(${marginRules.validFrom} IS NULL OR ${marginRules.validFrom} <= ${now})`,
          sql`(${marginRules.validTo} IS NULL OR ${marginRules.validTo} >= ${now})`
        ),
        orderBy: (marginRules, { desc }) => [desc(marginRules.priority)],
      }),
  )
}

/**
 * Récupère les transactions wallet partenaire récentes.
 *
 * Gap 40 : l'ancienne implémentation lisait `wallet_ledger` (table B2C)
 * qui n'est JAMAIS écrite par les flux partenaire (booking, recharge,
 * remboursement) — elle retournait donc toujours un tableau vide pour les
 * agences. Le vrai grand-livre partenaire est `partner_credit_movements`,
 * déjà utilisé correctement par `loadPartnerLedger()`.
 */
export async function getRecentWalletTransactionsCore(
  agencyId: string,
  limit: number = 20
) {
  return withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    (db) =>
      db
        .select()
        .from(partnerCreditMovements)
        .where(eq(partnerCreditMovements.agencyId, agencyId))
        .orderBy(desc(partnerCreditMovements.createdAt))
        .limit(limit),
  )
}
