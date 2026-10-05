/**
 * CRM-NICHE-01 — regroupe les leads réels d'une agence en segments
 * commerciaux mesurables (marché × produit × intention × destination ×
 * période), avec volume et taux de conversion.
 *
 * NICHE-PROVENANCE-01 — étend le group-by avec les colonnes résolues de
 * NETWORK-DEMAND-CAPTURE-01 (originAgencyId/capturedByUserId/channel/
 * campaignRef) : répond à "quelle origine génère quelle niche", y
 * compris le commercial apporteur. Un lead sans origine
 * connue (colonne NULL) forme son propre groupe "origine inconnue" —
 * jamais fusionné avec un lead qui EN a une (même principe anti-
 * fabrication que le reste du dépôt : une origine inconnue reste
 * inconnue, jamais supposée).
 *
 * PAS un fichier `"use server"` (même convention que leads-core.ts) —
 * `computeNicheSegmentsCore` est une fonction pure testable sans DB ;
 * `getNicheSegmentsCore` est le seul point qui touche Postgres.
 *
 * Périmètre CRM-NICHE-01 (ROADMAP) : sources déjà captées aujourd'hui
 * (site web/apps, colonnes leads.market/intention/destination). Les
 * sources réseau non encore branchées (agence physique, partenaire,
 * commercial, fournisseur-référent, pub, réseaux sociaux) sont hors
 * scope — voir CRM-NICHE-02.
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { leads } from "@/lib/db/schema"

export interface NicheSegmentInputRow {
  market: string
  productType: string
  intention: string
  destination: string | null
  status: string
  createdAt: Date
  /** NICHE-PROVENANCE-01 — colonnes résolues NETWORK-DEMAND-CAPTURE-01. */
  originAgencyId: string | null
  capturedByUserId: string | null
  channel: string | null
  campaignRef: string | null
}

export interface NicheSegment {
  market: string
  productType: string
  intention: string
  /** null = regroupé sans distinction de destination (non renseignée). */
  destination: string | null
  /** Période mensuelle, format "YYYY-MM" (UTC) — stable, comparable dans le temps. */
  period: string
  /** null = regroupé séparément des leads avec origine connue (jamais fusionné). */
  originAgencyId: string | null
  capturedByUserId: string | null
  channel: string | null
  campaignRef: string | null
  volume: number
  convertedCount: number
  /** 0-100, arrondi — 0 si volume=0 (jamais de division par zéro). */
  conversionRate: number
}

function toPeriodKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Fonction pure — un même jeu de leads produit toujours le même résultat
 * (reproductible), group-by déterministe sur les colonnes persistées.
 */
export function computeNicheSegmentsCore(
  rows: NicheSegmentInputRow[],
): NicheSegment[] {
  const groups = new Map<string, NicheSegment>()

  for (const row of rows) {
    const period = toPeriodKey(row.createdAt)
    const key = [
      row.market,
      row.productType,
      row.intention,
      row.destination ?? "",
      period,
      row.originAgencyId ?? "",
      row.capturedByUserId ?? "",
      row.channel ?? "",
      row.campaignRef ?? "",
    ].join("|")

    const isConverted = row.status === "converted"
    const existing = groups.get(key)
    if (existing) {
      existing.volume += 1
      if (isConverted) existing.convertedCount += 1
    } else {
      groups.set(key, {
        market: row.market,
        productType: row.productType,
        intention: row.intention,
        destination: row.destination,
        period,
        originAgencyId: row.originAgencyId,
        capturedByUserId: row.capturedByUserId,
        channel: row.channel,
        campaignRef: row.campaignRef,
        volume: 1,
        convertedCount: isConverted ? 1 : 0,
        conversionRate: 0,
      })
    }
  }

  const result = [...groups.values()]
  for (const segment of result) {
    segment.conversionRate =
      segment.volume > 0
        ? Math.round((segment.convertedCount / segment.volume) * 100)
        : 0
  }

  return result.sort((a, b) => b.volume - a.volume)
}

/**
 * Seul point de contact DB — lit les leads réels de l'agence et délègue
 * tout le calcul à computeNicheSegmentsCore (jamais de logique dupliquée).
 */
export async function getNicheSegmentsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string },
): Promise<NicheSegment[]> {
  const rows = await tx
    .select({
      market: leads.market,
      productType: leads.productType,
      intention: leads.intention,
      destination: leads.destination,
      status: leads.status,
      createdAt: leads.createdAt,
      originAgencyId: leads.originAgencyId,
      capturedByUserId: leads.capturedByUserId,
      channel: leads.channel,
      campaignRef: leads.campaignRef,
    })
    .from(leads)
    .where(eq(leads.agencyId, params.agencyId))

  return computeNicheSegmentsCore(rows)
}
