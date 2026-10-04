/**
 * CRM / Leads — Analytics funnel (CRM-J7-01). Matérialise la chaîne
 * lead → réservation → valeur financière → commission via JOIN direct
 * leads.reservationId → reservation_financials.reservationId.
 *
 * LEFT JOIN délibéré : un lead converti sans reservation_financials écrit
 * (cas transitoire tant que ECON-WIRING-01 n'est pas complet) reste compté
 * comme converti avec valeur = 0, plutôt qu'invisible.
 *
 * Pas de `"use server"` — même discipline que leads-core.ts.
 */

import { and, count, eq, gte, lte, sum } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { leads, reservationFinancials } from "@/lib/db/schema"
import type { LeadAcquisitionChannel } from "./leads-core"

export interface LeadFunnelRow {
  /** null = leads sans canal attribué (antérieurs à J6-BIS). */
  acquisitionChannel: LeadAcquisitionChannel | null
  totalLeads: number
  /** Leads avec reservationId non null (= status "converted"). */
  convertedLeads: number
  /** Somme salePriceTnd des reservation_financials liées (0 si aucune). */
  totalSaleTnd: number
  /** Somme marginAmount (0 si reservation_financials non écrit). */
  totalMarginTnd: number
  /** Somme commissionAmount. */
  totalCommissionTnd: number
}

/**
 * Retourne le funnel valeur CRM segmenté par canal. Chaque ligne représente
 * un canal (ou null pour les leads sans canal).
 *
 * Périmètre : leads créés entre `from` et `to` (limites incluses, UTC).
 * Filtre canal : restreint à un canal si fourni, sinon toutes les lignes.
 */
export async function getLeadFunnelValueCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    from?: Date
    to?: Date
    acquisitionChannel?: LeadAcquisitionChannel
  },
): Promise<LeadFunnelRow[]> {
  const conditions = [eq(leads.agencyId, params.agencyId)]
  if (params.from) conditions.push(gte(leads.createdAt, params.from))
  if (params.to) conditions.push(lte(leads.createdAt, params.to))
  if (params.acquisitionChannel)
    conditions.push(eq(leads.acquisitionChannel, params.acquisitionChannel))

  const rows = await tx
    .select({
      acquisitionChannel: leads.acquisitionChannel,
      totalLeads: count(leads.id),
      // COUNT(col) en SQL ne compte que les valeurs non-null →
      // équivalent à COUNT(*) WHERE reservationId IS NOT NULL.
      convertedLeads: count(leads.reservationId),
      totalSaleTnd: sum(reservationFinancials.salePriceTnd),
      totalMarginTnd: sum(reservationFinancials.marginAmount),
      totalCommissionTnd: sum(reservationFinancials.commissionAmount),
    })
    .from(leads)
    .leftJoin(
      reservationFinancials,
      eq(reservationFinancials.reservationId, leads.reservationId),
    )
    .where(and(...conditions))
    .groupBy(leads.acquisitionChannel)

  return rows.map((r) => ({
    acquisitionChannel: r.acquisitionChannel as LeadAcquisitionChannel | null,
    totalLeads: r.totalLeads,
    convertedLeads: r.convertedLeads,
    totalSaleTnd: r.totalSaleTnd ? parseFloat(r.totalSaleTnd) : 0,
    totalMarginTnd: r.totalMarginTnd ? parseFloat(r.totalMarginTnd) : 0,
    totalCommissionTnd: r.totalCommissionTnd
      ? parseFloat(r.totalCommissionTnd)
      : 0,
  }))
}

/**
 * Totaux agrégés toutes lignes confondues — somme de `getLeadFunnelValueCore`
 * sans groupement par canal. Utile pour un seul chiffre récapitulatif.
 */
export function aggregateFunnelRows(rows: LeadFunnelRow[]): {
  totalLeads: number
  convertedLeads: number
  totalSaleTnd: number
  totalMarginTnd: number
  totalCommissionTnd: number
  conversionRate: number
} {
  const totals = rows.reduce(
    (acc, r) => ({
      totalLeads: acc.totalLeads + r.totalLeads,
      convertedLeads: acc.convertedLeads + r.convertedLeads,
      totalSaleTnd: acc.totalSaleTnd + r.totalSaleTnd,
      totalMarginTnd: acc.totalMarginTnd + r.totalMarginTnd,
      totalCommissionTnd: acc.totalCommissionTnd + r.totalCommissionTnd,
    }),
    {
      totalLeads: 0,
      convertedLeads: 0,
      totalSaleTnd: 0,
      totalMarginTnd: 0,
      totalCommissionTnd: 0,
    },
  )

  return {
    ...totals,
    conversionRate:
      totals.totalLeads > 0
        ? Math.round((totals.convertedLeads / totals.totalLeads) * 100)
        : 0,
  }
}
