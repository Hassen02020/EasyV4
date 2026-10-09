/**
 * SIGNAL-ENGINE-01 — "Significatif ?"
 *
 * Convergence Radar Métier × Radar VIP :
 *   "Ce contact VIP est dans un marché en mouvement."
 *
 * Portée strictement limitée :
 *  - fonction pure, aucune DB, aucune persistance ;
 *  - deux types de signal : vip_x_destination, vip_x_product ;
 *  - uniquement les tendances POSITIVES (forte_hausse, hausse, nouveau) —
 *    un contact VIP en route vers un marché qui baisse n'est pas un signal ;
 *  - pas de signal de canal (dimensionType=channel) : un canal est une
 *    propriété opérationnelle, pas un signal de demande marché ;
 *  - combinedScore = vipScore + signalStrength (additif, transparent) ;
 *  - top SIGNAL_ENGINE_MAX_ROWS signaux retournés.
 *
 * Entrée VipInput intentionnellement minimale pour ne pas dépendre
 * de VipRadarRow (lib/admin/radar-vip-actions.ts "use server").
 */

import type { RadarSignal, SignalTrend } from "./radar-metier-core"

export const SIGNAL_ENGINE_MAX_ROWS = 30

/** Tendances positives retenues comme signaux. */
const POSITIVE_TRENDS: SignalTrend[] = ["forte_hausse", "hausse", "nouveau"]

export type SignalType = "vip_x_destination" | "vip_x_product"

/** Forme minimale d'un acteur VIP attendue par buildSignalEngineCore. */
export interface VipInput {
  leadId: string
  firstName: string
  lastName: string | null
  contactId: string | null
  vipScore: number
  leadCount: number
  /** Destination du lead représentant — peut ne pas couvrir tous les leads du groupe. */
  destination: string | null
  /** Produits distincts de tous les leads du groupe (RADAR-VIP-02/03). */
  products: string[]
}

export interface SignalRow {
  /** Identifiant unique du signal — `${leadId}:${dimensionType}:${dimension}`. */
  signalId: string
  signalType: SignalType
  // ─── côté VIP ───────────────────────────────────────────────────────────
  leadId: string
  firstName: string
  lastName: string | null
  contactId: string | null
  vipScore: number
  leadCount: number
  // ─── côté marché ────────────────────────────────────────────────────────
  /** Valeur de la dimension (ex. "Tunis", "omra"). */
  dimension: string
  dimensionType: "destination" | "productType"
  trend: SignalTrend
  signalStrength: number
  growthRate: string
  // ─── convergence ────────────────────────────────────────────────────────
  /** vipScore + signalStrength */
  combinedScore: number
  /** Phrase humaine courte : "X (VIP 87) × Destination Tunis (forte hausse +42%)" */
  insight: string
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const TREND_LABEL: Record<SignalTrend, string> = {
  forte_hausse: "forte hausse",
  hausse: "en hausse",
  nouveau: "nouveau",
  stable: "stable",
  baisse: "en baisse",
  forte_baisse: "forte baisse",
}

function insightLine(
  vip: VipInput,
  dimensionLabel: string,
  trend: SignalTrend,
  growthRate: string,
): string {
  const name = vip.firstName + (vip.lastName ? ` ${vip.lastName}` : "")
  const trendStr =
    growthRate && growthRate !== "N/A" && growthRate !== "+∞"
      ? `${TREND_LABEL[trend]} ${growthRate}`
      : TREND_LABEL[trend]
  return `${name} (VIP ${vip.vipScore}) × ${dimensionLabel} (${trendStr})`
}

/* -------------------------------------------------------------------------- */
/* Core                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Fonction pure — produit des SignalRow à partir de listes déjà calculées.
 * Pas de DB, pas d'effets de bord.
 */
export function buildSignalEngineCore(
  vipRows: VipInput[],
  radarSignals: RadarSignal[],
): SignalRow[] {
  // Index des signaux positifs par (dimensionType, dimension) pour lookup O(1).
  const signalIndex = new Map<string, RadarSignal>()
  for (const rs of radarSignals) {
    if (!POSITIVE_TRENDS.includes(rs.trend)) continue
    if (
      rs.dimensionType !== "destination" &&
      rs.dimensionType !== "productType"
    )
      continue
    signalIndex.set(`${rs.dimensionType}:${rs.dimension}`, rs)
  }

  const signals: SignalRow[] = []

  for (const vip of vipRows) {
    // Signal VIP × Destination
    if (vip.destination) {
      const rs = signalIndex.get(`destination:${vip.destination}`)
      if (rs) {
        signals.push({
          signalId: `${vip.leadId}:destination:${vip.destination}`,
          signalType: "vip_x_destination",
          leadId: vip.leadId,
          firstName: vip.firstName,
          lastName: vip.lastName,
          contactId: vip.contactId,
          vipScore: vip.vipScore,
          leadCount: vip.leadCount,
          dimension: vip.destination,
          dimensionType: "destination",
          trend: rs.trend,
          signalStrength: rs.signalStrength,
          growthRate: rs.growthRate,
          combinedScore: vip.vipScore + rs.signalStrength,
          insight: insightLine(
            vip,
            `Destination ${vip.destination}`,
            rs.trend,
            rs.growthRate,
          ),
        })
      }
    }

    // Signal VIP × Produit (un signal par produit distinct du groupe)
    const seenProducts = new Set<string>()
    for (const product of vip.products) {
      if (seenProducts.has(product)) continue
      seenProducts.add(product)
      const rs = signalIndex.get(`productType:${product}`)
      if (rs) {
        signals.push({
          signalId: `${vip.leadId}:productType:${product}`,
          signalType: "vip_x_product",
          leadId: vip.leadId,
          firstName: vip.firstName,
          lastName: vip.lastName,
          contactId: vip.contactId,
          vipScore: vip.vipScore,
          leadCount: vip.leadCount,
          dimension: product,
          dimensionType: "productType",
          trend: rs.trend,
          signalStrength: rs.signalStrength,
          growthRate: rs.growthRate,
          combinedScore: vip.vipScore + rs.signalStrength,
          insight: insightLine(vip, product, rs.trend, rs.growthRate),
        })
      }
    }
  }

  // Trier par combinedScore décroissant, dédupliquer par signalId (sécurité),
  // garder top SIGNAL_ENGINE_MAX_ROWS.
  const seen = new Set<string>()
  const deduped: SignalRow[] = []
  signals.sort((a, b) => b.combinedScore - a.combinedScore)
  for (const s of signals) {
    if (seen.has(s.signalId)) continue
    seen.add(s.signalId)
    deduped.push(s)
    if (deduped.length >= SIGNAL_ENGINE_MAX_ROWS) break
  }
  return deduped
}
