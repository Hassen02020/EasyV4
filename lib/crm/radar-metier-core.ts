/**
 * RADAR-METIER-01 — "Qu'est-ce qui bouge ?"
 *
 * Transforme les TimeSeriesRow en RadarSignal classés par force de signal.
 * Une "force" combine le volume absolu courant et le taux de croissance :
 *   signalStrength = currentVolume × (1 + clampedGrowthRate)
 * où currentVolume = leads courants pour les dimensions leads,
 *                    et CA courant en TND pour la dimension module.
 *
 * Classification :
 *   growthRate > 20%  → "forte_hausse"
 *   growthRate > 5%   → "hausse"
 *   growthRate > -5%  → "stable"
 *   growthRate > -20% → "baisse"
 *   else              → "forte_baisse"
 *   N/A / +∞         → "nouveau" (premier signal, pas de précédent)
 *
 * PAS un fichier "use server".
 */

import type { TimeSeriesRow } from "./time-series-core"

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type SignalTrend =
  | "forte_hausse"
  | "hausse"
  | "stable"
  | "baisse"
  | "forte_baisse"
  | "nouveau"

export interface RadarSignal {
  dimension: string
  dimensionType: TimeSeriesRow["dimensionType"]
  trend: SignalTrend
  /** Volume courant (leads ou CA TND pour module) */
  currentVolume: number
  /** Volume précédent */
  prevVolume: number
  /** growthRate texte (ex. "+12.5%") */
  growthRate: string
  /** Score de force — plus haut = plus actionnable */
  signalStrength: number
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function classifyTrend(growthRateStr: string): SignalTrend {
  if (growthRateStr === "N/A") return "stable"
  if (growthRateStr === "+∞") return "nouveau"
  const n = parseFloat(growthRateStr)
  if (!Number.isFinite(n)) return "stable"
  if (n > 20) return "forte_hausse"
  if (n > 5) return "hausse"
  if (n >= -5) return "stable"
  if (n >= -20) return "baisse"
  return "forte_baisse"
}

/* -------------------------------------------------------------------------- */
/* Core                                                                        */
/* -------------------------------------------------------------------------- */

export function buildRadarMetierCore(rows: TimeSeriesRow[]): RadarSignal[] {
  const signals: RadarSignal[] = rows
    .filter((r) => r.currentLeads > 0 || parseFloat(r.currentCa) > 0)
    .map((r): RadarSignal => {
      const isFinancial = r.dimensionType === "module"
      const currentVolume = isFinancial
        ? Math.round(parseFloat(r.currentCa))
        : r.currentLeads
      const prevVolume = isFinancial
        ? Math.round(parseFloat(r.prevCa))
        : r.prevLeads
      const growthRateStr = isFinancial ? r.caGrowthRate : r.leadsGrowthRate
      const trend = classifyTrend(growthRateStr)

      // Facteur de croissance normalisé (-1 à +∞, plafonné à +2 pour éviter les explosions)
      let growthFactor = 0
      if (growthRateStr === "+∞") {
        growthFactor = 2
      } else if (growthRateStr !== "N/A") {
        const pct = parseFloat(growthRateStr)
        growthFactor = Math.max(-1, Math.min(2, pct / 100))
      }

      const signalStrength = Math.round(currentVolume * (1 + growthFactor))

      return {
        dimension: r.dimension,
        dimensionType: r.dimensionType,
        trend,
        currentVolume,
        prevVolume,
        growthRate: growthRateStr,
        signalStrength,
      }
    })

  // Trier : signal strength descendant, à volume égal hausse avant baisse
  signals.sort((a, b) => b.signalStrength - a.signalStrength)

  return signals
}
