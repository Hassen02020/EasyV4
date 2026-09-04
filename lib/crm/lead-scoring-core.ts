/**
 * CRM / Leads — Scoring (étape 2/3 : Conversion → Scoring → Relance, voir
 * `leads-core.ts` pour l'étape 1). Moteur central, PAS un fichier
 * `"use server"` (même leçon Phase 38A que les autres modules `-core.ts`).
 *
 * 4 signaux FIXES, objectivement observables sur le lead lui-même — jamais
 * un critère métier inventé (ex. "budget probable", "urgence perçue") que
 * rien dans les données ne permettrait de vérifier honnêtement :
 *  - contact_complete   : email ET téléphone renseignés
 *  - has_message        : un message a été rédigé
 *  - specific_product   : productType ≠ "general"
 *  - has_product_ref    : référence précise vers un produit/session, pas
 *                         seulement une catégorie
 *
 * Le score est TOUJOURS transparent : `computeLeadScore` retourne le détail
 * signal par signal, jamais un total opaque. Les points par signal sont
 * CONFIGURABLES par le staff OTA (lead-scoring-actions.ts) — défaut neutre
 * (25 points chacun) tant que rien n'est configuré, même principe que
 * DEFAULT_MARGINS (lib/pro/pricing.ts).
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { leadScoringRules, type NewLeadScoringRule } from "@/lib/db/schema"
import type { LeadRow } from "./leads-core"

export const LEAD_SCORE_SIGNALS = [
  "contact_complete",
  "has_message",
  "specific_product",
  "has_product_ref",
] as const
export type LeadScoreSignal = (typeof LEAD_SCORE_SIGNALS)[number]

export const LEAD_SCORE_SIGNAL_LABELS: Record<LeadScoreSignal, string> = {
  contact_complete: "Coordonnées complètes (email + téléphone)",
  has_message: "Message rédigé",
  specific_product: "Produit spécifique (pas « Général »)",
  has_product_ref: "Référence produit précise",
}

/** Poids neutre par défaut — égal pour les 4 signaux, éditable immédiatement. */
export const DEFAULT_SIGNAL_POINTS = 25

export type LeadScoreRuleMap = Record<LeadScoreSignal, { points: number; isActive: boolean }>

export function defaultLeadScoreRuleMap(): LeadScoreRuleMap {
  const map = {} as LeadScoreRuleMap
  for (const signal of LEAD_SCORE_SIGNALS) {
    map[signal] = { points: DEFAULT_SIGNAL_POINTS, isActive: true }
  }
  return map
}

/** Évalue les 4 signaux sur un lead donné — pure, sans DB. */
function evaluateSignal(signal: LeadScoreSignal, lead: LeadRow): boolean {
  switch (signal) {
    case "contact_complete":
      return Boolean(lead.email) && Boolean(lead.phone)
    case "has_message":
      return Boolean(lead.message && lead.message.trim().length > 0)
    case "specific_product":
      return lead.productType !== "general"
    case "has_product_ref":
      return Boolean(lead.productRef)
  }
}

export interface LeadScoreBreakdownItem {
  signal: LeadScoreSignal
  label: string
  points: number
  matched: boolean
}

export interface LeadScore {
  total: number
  breakdown: LeadScoreBreakdownItem[]
}

/**
 * Calcule le score d'un lead — pure, sans DB. `rules` doit couvrir les 4
 * signaux (voir `defaultLeadScoreRuleMap`/`getLeadScoreRuleMapCore`) ; un
 * signal absent de `rules` ou désactivé (`isActive: false`) ne contribue
 * jamais au total, même s'il matche.
 */
export function computeLeadScore(lead: LeadRow, rules: LeadScoreRuleMap): LeadScore {
  const breakdown: LeadScoreBreakdownItem[] = LEAD_SCORE_SIGNALS.map((signal) => {
    const rule = rules[signal]
    // `matched` reflète le signal réel sur le lead, indépendamment de si la
    // règle est active — un signal matché mais désactivé reste visible dans
    // le détail (0 point), jamais masqué : c'est ça, la transparence.
    const matched = evaluateSignal(signal, lead)
    const points = rule?.isActive && matched ? rule.points : 0
    return { signal, label: LEAD_SCORE_SIGNAL_LABELS[signal], points, matched }
  })
  const total = breakdown.reduce((sum, item) => sum + item.points, 0)
  return { total, breakdown }
}

/**
 * Lit la configuration réelle en DB, fusionnée avec les défauts pour les
 * signaux non encore configurés — même principe que `getMarginsForAgency`
 * (lib/pro/server-context.ts).
 */
export async function getLeadScoreRuleMapCore(
  tx: DrizzleTransaction,
  params: { agencyId: string },
): Promise<LeadScoreRuleMap> {
  const rows = await tx
    .select({ signal: leadScoringRules.signal, points: leadScoringRules.points, isActive: leadScoringRules.isActive })
    .from(leadScoringRules)
    .where(eq(leadScoringRules.agencyId, params.agencyId))

  const map = defaultLeadScoreRuleMap()
  for (const row of rows) {
    if ((LEAD_SCORE_SIGNALS as readonly string[]).includes(row.signal)) {
      map[row.signal as LeadScoreSignal] = { points: row.points, isActive: row.isActive }
    }
  }
  return map
}

export async function upsertLeadScoreRuleCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; signal: LeadScoreSignal; points: number; isActive: boolean },
): Promise<{ id: string }> {
  const values: NewLeadScoringRule = {
    agencyId: params.agencyId,
    signal: params.signal,
    points: params.points,
    isActive: params.isActive,
  }
  const [row] = await tx
    .insert(leadScoringRules)
    .values(values)
    .onConflictDoUpdate({
      target: [leadScoringRules.agencyId, leadScoringRules.signal],
      set: { points: values.points, isActive: values.isActive, updatedAt: new Date() },
    })
    .returning({ id: leadScoringRules.id })
  return { id: row!.id }
}
