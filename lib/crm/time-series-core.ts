/**
 * TIME-SERIES-01 — couche de calcul période-sur-période partagée.
 *
 * Répond aux piliers "FRÉQUENCE" et "CROISSANCE" de la vision Easy2Book :
 * pour chaque dimension (module réservation, canal lead, type produit lead),
 * compare la fenêtre courante à la fenêtre précédente de même durée.
 *
 * Deux flux indépendants :
 *  1. CA/marge  : reservationFinancials JOIN reservations (date = reservations.createdAt)
 *  2. Volume leads : leads.createdAt
 *
 * Aucun recalcul financier — FINANCIAL reste propriétaire de la vérité.
 * PAS un fichier "use server" (même convention que les autres -core.ts).
 */

import { and, eq, gte, lt, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { reservationFinancials, reservations, leads } from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface TimeSeriesRow {
  dimension: string
  dimensionType: "module" | "channel" | "productType" | "destination"
  currentCa: string
  prevCa: string
  caGrowthRate: string
  currentMargin: string
  prevMargin: string
  marginGrowthRate: string
  currentLeads: number
  prevLeads: number
  leadsGrowthRate: string
}

export interface TimeSeriesParams {
  agencyId: string
  windowWeeks: number
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function growthRate(current: number, prev: number): string {
  if (prev === 0) return current > 0 ? "+∞" : "N/A"
  const pct = ((current - prev) / prev) * 100
  const sign = pct >= 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}

function numericGrowth(current: string, prev: string): string {
  const c = parseFloat(current)
  const p = parseFloat(prev)
  if (!Number.isFinite(c) || !Number.isFinite(p)) return "N/A"
  if (p === 0) return c > 0 ? "+∞" : "N/A"
  const pct = ((c - p) / p) * 100
  const sign = pct >= 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}

/* -------------------------------------------------------------------------- */
/* Core                                                                        */
/* -------------------------------------------------------------------------- */

export async function getTimeSeriesCore(
  tx: DrizzleTransaction,
  params: TimeSeriesParams,
): Promise<TimeSeriesRow[]> {
  const { agencyId, windowWeeks } = params
  const now = new Date()
  const windowMs = windowWeeks * 7 * 24 * 60 * 60 * 1000
  const currentStart = new Date(now.getTime() - windowMs)
  const prevStart = new Date(now.getTime() - windowMs * 2)

  // -------------------------------------------------------------------------
  // 1. CA / Marge par module de réservation
  // -------------------------------------------------------------------------
  const finStream = await tx
    .select({
      module: reservations.module,
      period: sql<string>`case when ${reservations.createdAt} >= ${currentStart} then 'current' else 'prev' end`,
      totalCa: sql<string>`coalesce(sum(${reservationFinancials.salePriceTnd}::numeric), 0)::text`,
      totalMargin: sql<string>`coalesce(sum(${reservationFinancials.marginAmount}::numeric), 0)::text`,
    })
    .from(reservationFinancials)
    .innerJoin(
      reservations,
      eq(reservations.id, reservationFinancials.reservationId),
    )
    .where(
      and(
        eq(reservations.agencyId, agencyId),
        gte(reservations.createdAt, prevStart),
        lt(reservations.createdAt, now),
      ),
    )
    .groupBy(
      reservations.module,
      sql`case when ${reservations.createdAt} >= ${currentStart} then 'current' else 'prev' end`,
    )

  // -------------------------------------------------------------------------
  // 2. Volume leads par channel
  // -------------------------------------------------------------------------
  const leadsChannelStream = await tx
    .select({
      channel: leads.channel,
      period: sql<string>`case when ${leads.createdAt} >= ${currentStart} then 'current' else 'prev' end`,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(
      and(
        eq(leads.agencyId, agencyId),
        gte(leads.createdAt, prevStart),
        lt(leads.createdAt, now),
      ),
    )
    .groupBy(
      leads.channel,
      sql`case when ${leads.createdAt} >= ${currentStart} then 'current' else 'prev' end`,
    )

  // -------------------------------------------------------------------------
  // 3. Volume leads par productType
  // -------------------------------------------------------------------------
  const leadsProductStream = await tx
    .select({
      productType: leads.productType,
      period: sql<string>`case when ${leads.createdAt} >= ${currentStart} then 'current' else 'prev' end`,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(
      and(
        eq(leads.agencyId, agencyId),
        gte(leads.createdAt, prevStart),
        lt(leads.createdAt, now),
      ),
    )
    .groupBy(
      leads.productType,
      sql`case when ${leads.createdAt} >= ${currentStart} then 'current' else 'prev' end`,
    )

  // -------------------------------------------------------------------------
  // 4. Volume leads par destination (non-null uniquement)
  // -------------------------------------------------------------------------
  const leadsDestinationStream = await tx
    .select({
      destination: leads.destination,
      period: sql<string>`case when ${leads.createdAt} >= ${currentStart} then 'current' else 'prev' end`,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(
      and(
        eq(leads.agencyId, agencyId),
        gte(leads.createdAt, prevStart),
        lt(leads.createdAt, now),
        sql`${leads.destination} is not null`,
      ),
    )
    .groupBy(
      leads.destination,
      sql`case when ${leads.createdAt} >= ${currentStart} then 'current' else 'prev' end`,
    )

  // -------------------------------------------------------------------------
  // 5. Assembly
  // -------------------------------------------------------------------------
  const rows: TimeSeriesRow[] = []

  // CA/Marge rows keyed by module
  type FinKey = {
    currentCa: string
    prevCa: string
    currentMargin: string
    prevMargin: string
  }
  const finMap = new Map<string, FinKey>()
  for (const f of finStream) {
    const key = String(f.module)
    const entry = finMap.get(key) ?? {
      currentCa: "0",
      prevCa: "0",
      currentMargin: "0",
      prevMargin: "0",
    }
    if (f.period === "current") {
      entry.currentCa = f.totalCa
      entry.currentMargin = f.totalMargin
    } else {
      entry.prevCa = f.totalCa
      entry.prevMargin = f.totalMargin
    }
    finMap.set(key, entry)
  }
  for (const [module, fin] of finMap) {
    rows.push({
      dimension: module,
      dimensionType: "module",
      currentCa: fin.currentCa,
      prevCa: fin.prevCa,
      caGrowthRate: numericGrowth(fin.currentCa, fin.prevCa),
      currentMargin: fin.currentMargin,
      prevMargin: fin.prevMargin,
      marginGrowthRate: numericGrowth(fin.currentMargin, fin.prevMargin),
      currentLeads: 0,
      prevLeads: 0,
      leadsGrowthRate: "N/A",
    })
  }

  // Leads by channel
  const channelMap = new Map<string, { current: number; prev: number }>()
  for (const l of leadsChannelStream) {
    const key = l.channel ?? "(direct)"
    const entry = channelMap.get(key) ?? { current: 0, prev: 0 }
    if (l.period === "current") entry.current += l.count
    else entry.prev += l.count
    channelMap.set(key, entry)
  }
  for (const [channel, counts] of channelMap) {
    rows.push({
      dimension: channel,
      dimensionType: "channel",
      currentCa: "0",
      prevCa: "0",
      caGrowthRate: "N/A",
      currentMargin: "0",
      prevMargin: "0",
      marginGrowthRate: "N/A",
      currentLeads: counts.current,
      prevLeads: counts.prev,
      leadsGrowthRate: growthRate(counts.current, counts.prev),
    })
  }

  // Leads by productType
  const productMap = new Map<string, { current: number; prev: number }>()
  for (const l of leadsProductStream) {
    const key = l.productType
    const entry = productMap.get(key) ?? { current: 0, prev: 0 }
    if (l.period === "current") entry.current += l.count
    else entry.prev += l.count
    productMap.set(key, entry)
  }
  for (const [productType, counts] of productMap) {
    rows.push({
      dimension: productType,
      dimensionType: "productType",
      currentCa: "0",
      prevCa: "0",
      caGrowthRate: "N/A",
      currentMargin: "0",
      prevMargin: "0",
      marginGrowthRate: "N/A",
      currentLeads: counts.current,
      prevLeads: counts.prev,
      leadsGrowthRate: growthRate(counts.current, counts.prev),
    })
  }

  // Leads by destination
  const destinationMap = new Map<string, { current: number; prev: number }>()
  for (const l of leadsDestinationStream) {
    const key = l.destination ?? "(inconnue)"
    const entry = destinationMap.get(key) ?? { current: 0, prev: 0 }
    if (l.period === "current") entry.current += l.count
    else entry.prev += l.count
    destinationMap.set(key, entry)
  }
  for (const [destination, counts] of destinationMap) {
    rows.push({
      dimension: destination,
      dimensionType: "destination",
      currentCa: "0",
      prevCa: "0",
      caGrowthRate: "N/A",
      currentMargin: "0",
      prevMargin: "0",
      marginGrowthRate: "N/A",
      currentLeads: counts.current,
      prevLeads: counts.prev,
      leadsGrowthRate: growthRate(counts.current, counts.prev),
    })
  }

  return rows
}
