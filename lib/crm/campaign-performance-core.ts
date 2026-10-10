/**
 * CAMPAIGN-PERFORMANCE-01 — mesure et attribution, JAMAIS la vérité
 * financière elle-même. Répond à "combien de réservations, combien de
 * chiffre d'affaires, combien de marge pour CETTE campagne ?" en
 * relisant à la demande `campaign_targets` (exposition) et
 * `campaign_attributions` + `reservationFinancials` (conversion/CA/
 * marge) — jamais un second calcul, jamais une valeur mise en cache
 * sur `campaigns`.
 *
 * Audit de conception dédié (docs/ROADMAP.md) : CA et marge DOIVENT
 * être lus par jointure vers `reservationFinancials` (FINANCIAL, seul
 * propriétaire de cette vérité), jamais stockés en dur sur `campaigns`
 * — exactement le principe déjà énoncé lors de l'audit PROMO
 * ("CAMPAIGN mesure et attribue ; FINANCIAL possède la vérité
 * financière"). Ce module n'écrit RIEN — lecture pure.
 *
 * Zéro nouvelle table/colonne : `reservationFinancials.reservationId`
 * est déjà UNIQUE (vérifié, `reservation_financials_reservation_idx`)
 * — une somme sur une jointure `campaign_attributions ⋈
 * reservationFinancials` ne peut donc jamais compter une réservation
 * deux fois.
 *
 * PAS un fichier `"use server"` (même convention que les autres
 * modules -core.ts de ce dépôt).
 */

import { and, eq, isNull, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  campaignTargets,
  campaignAttributions,
  reservationFinancials,
} from "@/lib/db/schema"
import { sumRevenueMarginCore } from "@/lib/reporting/margin-analytics-core"

export interface CampaignPerformance {
  campaignId: string
  /** Nombre de CONTACTs ciblés au lancement (campaign_targets). */
  exposed: number
  /** Nombre de réservations réellement attribuées (campaign_attributions). */
  converted: number
  /** Somme de reservationFinancials.salePriceTnd pour les réservations attribuées. */
  revenueTnd: string
  /** Somme de reservationFinancials.marginAmount pour les réservations attribuées. */
  marginTnd: string
  /** Nombre de cibles dont le message a été envoyé (deliveryStatus='sent'). */
  sent: number
  /** Nombre de cibles dont l'envoi a échoué (deliveryStatus='failed'). */
  failed: number
  /** Nombre de cibles skippées — consentement révoqué, canal non configuré… (deliveryStatus='skipped'). */
  skipped: number
  /** Nombre de cibles en attente d'envoi (deliveryStatus='pending'). */
  pending: number
  /** Total livraison = sent + failed + skipped + pending (invariant : = exposed). */
  totalTargets: number
}

export async function getCampaignPerformanceCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; campaignId: string },
): Promise<CampaignPerformance> {
  const [exposedRow] = await tx
    .select({
      count: sql<number>`count(*)::int`,
      sent: sql<number>`count(case when ${campaignTargets.deliveryStatus} = 'sent' then 1 end)::int`,
      failed: sql<number>`count(case when ${campaignTargets.deliveryStatus} = 'failed' then 1 end)::int`,
      skipped: sql<number>`count(case when ${campaignTargets.deliveryStatus} = 'skipped' then 1 end)::int`,
      pending: sql<number>`count(case when ${campaignTargets.deliveryStatus} = 'pending' then 1 end)::int`,
    })
    .from(campaignTargets)
    .where(
      and(
        eq(campaignTargets.campaignId, params.campaignId),
        eq(campaignTargets.agencyId, params.agencyId),
      ),
    )

  const attributedRows = await tx
    .select({
      salePriceTnd: reservationFinancials.salePriceTnd,
      marginAmount: reservationFinancials.marginAmount,
    })
    .from(campaignAttributions)
    .innerJoin(
      reservationFinancials,
      eq(
        reservationFinancials.reservationId,
        campaignAttributions.reservationId,
      ),
    )
    .where(
      and(
        eq(campaignAttributions.campaignId, params.campaignId),
        eq(campaignAttributions.agencyId, params.agencyId),
        // PROMO-CAMPAIGN-CANCEL-01 : une réservation annulée/remboursée ne
        // compte pas comme conversion — le chiffre d'affaires et la marge
        // reportés reflètent uniquement les réservations réellement honorées.
        isNull(reservationFinancials.cancelledAt),
      ),
    )

  const { revenueTnd, marginTnd } = sumRevenueMarginCore(attributedRows)

  return {
    campaignId: params.campaignId,
    exposed: exposedRow?.count ?? 0,
    converted: attributedRows.length,
    revenueTnd: revenueTnd.toFixed(2),
    marginTnd: marginTnd.toFixed(2),
    sent: exposedRow?.sent ?? 0,
    failed: exposedRow?.failed ?? 0,
    skipped: exposedRow?.skipped ?? 0,
    pending: exposedRow?.pending ?? 0,
    totalTargets:
      (exposedRow?.sent ?? 0) +
      (exposedRow?.failed ?? 0) +
      (exposedRow?.skipped ?? 0) +
      (exposedRow?.pending ?? 0),
  }
}
