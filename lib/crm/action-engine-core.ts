/**
 * ACTION-ENGINE-01 — "Quoi faire ?"
 *
 * Troisième étage du programme Radar :
 *   SIGNAL ENGINE → "Ce contact VIP est dans un marché en mouvement."
 *   ACTION ENGINE → Recommandation structurée, explicable et exécutable.
 *
 * Portée strictement limitée :
 *  - fonction pure, aucune DB, aucune persistance ;
 *  - une ActionRow par signal convergent (1:1) ;
 *  - priorité dérivée du combinedScore (transparent) ;
 *  - canal dérivé de la priorité (transparent) ;
 *  - rationale = "POURQUOI cette action" (explicable) ;
 *  - campaignHints = payload structuré pour Campaign Engine.
 *
 * Chaque champ de ActionRow est :
 *   - human-readable (agent commercial peut l'afficher directement), ET
 *   - machine-readable (Campaign Engine peut le consommer sans re-dériver).
 */

import type { SignalRow, SignalType } from "./signal-engine-core"
import type { SignalTrend } from "./radar-metier-core"

export type ActionPriority = "urgent" | "haute" | "normale" | "faible"

export type ActionType =
  | "appel_direct"
  | "whatsapp_personnalise"
  | "email_personnalise"
  | "email_decouverte"
  | "newsletter"

export type ActionChannel = "phone" | "whatsapp" | "email"

export type UrgencyWindow = "24h" | "48h" | "7j" | "14j" | "30j"

/**
 * Payload structuré consommable par Campaign Engine sans re-dériver le contexte.
 * Toutes les valeurs sont primitives — pas de référence circulaire, sérialisable JSON.
 */
export interface CampaignHints {
  /** Dimension à mettre en avant dans la campagne */
  offerDimension: string
  offerDimensionType: "destination" | "productType"
  /** Type d'action suggéré — pour orchestration Campaign Engine */
  suggestedActionType: ActionType
  /** Canal recommandé */
  channel: ActionChannel
  /** Fenêtre d'urgence en heures (pour scheduling Campaign Engine) */
  urgencyHours: number
  /** Score VIP — pour segmentation et personnalisation du message */
  vipScore: number
  /** Nombre de leads du groupe — indique un acteur multi-produit si > 1 */
  leadCount: number
  /** Trend marché — pour personnalisation du contenu */
  marketTrend: SignalTrend
  /** Taux de croissance marché — pour mention dans le message */
  marketGrowthRate: string
  /** Force du signal marché */
  signalStrength: number
}

export interface ActionRow {
  /** Identifiant unique : `action:${signalId}` */
  actionId: string
  /** Signal d'origine */
  signalId: string
  signalType: SignalType
  // ─── priorité & canal ──────────────────────────────────────────────────
  priority: ActionPriority
  /** 0–100 pour affichage barre */
  priorityScore: number
  actionType: ActionType
  channel: ActionChannel
  urgencyWindow: UrgencyWindow
  // ─── côté VIP ──────────────────────────────────────────────────────────
  leadId: string
  firstName: string
  lastName: string | null
  contactId: string | null
  vipScore: number
  leadCount: number
  // ─── côté marché ───────────────────────────────────────────────────────
  dimension: string
  dimensionType: "destination" | "productType"
  trend: SignalTrend
  growthRate: string
  combinedScore: number
  // ─── recommandation structurée ─────────────────────────────────────────
  /** Dimension mise en avant : "Destination Tunis" ou "Produit Omra" */
  offerFocus: string
  /** POURQUOI cette action (explicable, prêt à afficher) */
  rationale: string
  /** QUOI dire (phrase d'action pour l'agent commercial) */
  scriptLine: string
  /** Sujet court pour email/appel */
  subject: string
  /** Payload machine-readable pour Campaign Engine */
  campaignHints: CampaignHints
}

/* -------------------------------------------------------------------------- */
/* Seuils de priorité                                                         */
/* -------------------------------------------------------------------------- */

const PRIORITY_THRESHOLDS: { min: number; priority: ActionPriority }[] = [
  { min: 150, priority: "urgent" },
  { min: 100, priority: "haute" },
  { min: 60, priority: "normale" },
  { min: 0, priority: "faible" },
]

function derivePriority(combinedScore: number): ActionPriority {
  for (const { min, priority } of PRIORITY_THRESHOLDS) {
    if (combinedScore >= min) return priority
  }
  return "faible"
}

const ACTION_MATRIX: Record<
  ActionPriority,
  { actionType: ActionType; channel: ActionChannel; urgencyHours: number; urgencyWindow: UrgencyWindow }
> = {
  urgent: { actionType: "appel_direct", channel: "phone", urgencyHours: 24, urgencyWindow: "24h" },
  haute: { actionType: "whatsapp_personnalise", channel: "whatsapp", urgencyHours: 48, urgencyWindow: "48h" },
  normale: { actionType: "email_personnalise", channel: "email", urgencyHours: 168, urgencyWindow: "7j" },
  faible: { actionType: "email_decouverte", channel: "email", urgencyHours: 336, urgencyWindow: "14j" },
}

function derivePriorityScore(combinedScore: number, max = 200): number {
  return Math.min(100, Math.round((combinedScore / max) * 100))
}

/* -------------------------------------------------------------------------- */
/* Libellés humains                                                           */
/* -------------------------------------------------------------------------- */

const PRODUCT_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Activité",
  general: "Général",
}

const TREND_SHORT: Record<SignalTrend, string> = {
  forte_hausse: "forte hausse",
  hausse: "en hausse",
  nouveau: "nouveau segment",
  stable: "stable",
  baisse: "en baisse",
  forte_baisse: "forte baisse",
}

const TREND_RATIONALE: Record<SignalTrend, string> = {
  forte_hausse: "marché en forte hausse",
  hausse: "marché en hausse",
  nouveau: "nouveau marché détecté",
  stable: "marché stable",
  baisse: "marché en baisse",
  forte_baisse: "marché en forte baisse",
}

function buildOfferFocus(row: SignalRow): string {
  if (row.dimensionType === "destination") return `Destination ${row.dimension}`
  return PRODUCT_LABEL[row.dimension] ?? row.dimension
}

function buildSubject(row: SignalRow, offerFocus: string): string {
  if (row.dimensionType === "destination") return `Offre ${offerFocus}`
  return `Produit ${offerFocus} — ${TREND_SHORT[row.trend]}`
}

function buildRationale(row: SignalRow): string {
  const growthPart =
    row.growthRate && row.growthRate !== "N/A" && row.growthRate !== "+∞"
      ? ` (${row.growthRate})`
      : ""
  const offerFocus = buildOfferFocus(row)
  return (
    `${offerFocus} : ${TREND_RATIONALE[row.trend]}${growthPart}` +
    ` — VIP score ${row.vipScore}` +
    (row.leadCount > 1 ? ` (×${row.leadCount} dossiers)` : "") +
    `. Score combiné ${row.combinedScore}.`
  )
}

function buildScriptLine(
  row: SignalRow,
  actionType: ActionType,
  channel: ActionChannel,
  offerFocus: string,
): string {
  const name = row.firstName + (row.lastName ? ` ${row.lastName}` : "")
  const growthStr =
    row.growthRate && row.growthRate !== "N/A" && row.growthRate !== "+∞"
      ? ` ${row.growthRate}`
      : ""
  const trendStr = `${TREND_SHORT[row.trend]}${growthStr}`

  switch (actionType) {
    case "appel_direct":
      return `Appelez ${name} pour proposer une offre sur ${offerFocus} — ${trendStr}.`
    case "whatsapp_personnalise":
      return `Envoyez un message WhatsApp personnalisé à ${name} sur ${offerFocus} — ${trendStr}.`
    case "email_personnalise":
      return `Envoyez un email personnalisé à ${name} sur ${offerFocus} — ${trendStr}.`
    case "email_decouverte":
      return `Envoyez un email de découverte à ${name} pour ${offerFocus} — ${trendStr}.`
    case "newsletter":
      return `Incluez ${name} dans la newsletter ciblée sur ${offerFocus}.`
  }
}

/* -------------------------------------------------------------------------- */
/* Core                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Fonction pure — produit des ActionRow structurées à partir de SignalRow triés.
 * Pas de DB, pas d'effets de bord.
 *
 * Chaque ActionRow contient :
 *  - les données brutes du signal (pour audit)
 *  - la recommandation humaine (priority, actionType, scriptLine)
 *  - le rationale explicable (pourquoi cette action)
 *  - le campaignHints sérialisable (pour Campaign Engine)
 *
 * Ordre d'entrée préservé (signal le plus fort → action la plus urgente).
 */
export function buildActionEngineCore(signals: SignalRow[]): ActionRow[] {
  return signals.map((row) => {
    const priority = derivePriority(row.combinedScore)
    const { actionType, channel, urgencyHours, urgencyWindow } = ACTION_MATRIX[priority]
    const offerFocus = buildOfferFocus(row)

    return {
      actionId: `action:${row.signalId}`,
      signalId: row.signalId,
      signalType: row.signalType,
      priority,
      priorityScore: derivePriorityScore(row.combinedScore),
      actionType,
      channel,
      urgencyWindow,
      leadId: row.leadId,
      firstName: row.firstName,
      lastName: row.lastName,
      contactId: row.contactId,
      vipScore: row.vipScore,
      leadCount: row.leadCount,
      dimension: row.dimension,
      dimensionType: row.dimensionType,
      trend: row.trend,
      growthRate: row.growthRate,
      combinedScore: row.combinedScore,
      offerFocus,
      rationale: buildRationale(row),
      scriptLine: buildScriptLine(row, actionType, channel, offerFocus),
      subject: buildSubject(row, offerFocus),
      campaignHints: {
        offerDimension: row.dimension,
        offerDimensionType: row.dimensionType,
        suggestedActionType: actionType,
        channel,
        urgencyHours,
        vipScore: row.vipScore,
        leadCount: row.leadCount,
        marketTrend: row.trend,
        marketGrowthRate: row.growthRate,
        signalStrength: row.signalStrength,
      },
    }
  })
}

export const ACTION_TYPE_LABEL: Record<ActionType, string> = {
  appel_direct: "Appel direct",
  whatsapp_personnalise: "WhatsApp personnalisé",
  email_personnalise: "Email personnalisé",
  email_decouverte: "Email de découverte",
  newsletter: "Newsletter ciblée",
}

export const PRIORITY_LABEL: Record<ActionPriority, string> = {
  urgent: "Urgent",
  haute: "Haute",
  normale: "Normale",
  faible: "Faible",
}
