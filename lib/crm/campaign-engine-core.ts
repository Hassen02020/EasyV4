/**
 * CAMPAIGN-ENGINE-01 — "Quelles campagnes lancer ?"
 *
 * Cinquième étage du programme Radar (branche parallèle à LEARNING) :
 *   ACTION ENGINE → CAMPAIGN ENGINE
 *
 * Rôle : grouper les ActionRow par (channel × dimension) en
 * CampaignProposal. Chaque proposal est un payload prêt à être passé
 * à createCampaignCore + launchCampaignCore (lib/crm/campaign-persistence-core.ts)
 * sans re-dériver le contexte.
 *
 * Portée strictement limitée :
 *  - fonction pure, aucune DB, aucune persistance ;
 *  - lecture seule des ActionRow existants — aucun calcul dupliqué ;
 *  - ne crée PAS de campagne — c'est la décision de l'agent commercial ;
 *  - mappe ActionChannel → CrmChannel (phone→call, whatsapp→whatsapp,
 *    email→email) pour la compatibilité avec campaign-persistence-core.ts.
 */

import type { ActionRow, ActionPriority, ActionChannel, UrgencyWindow } from "./action-engine-core"
import type { SignalTrend } from "./radar-metier-core"
import type { CrmChannel } from "@/lib/db/schema"

export type { ActionPriority, ActionChannel }

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Payload prêt à être passé à createCampaignCore.
 * Chaque champ est human-readable ET machine-readable (même discipline
 * que ActionRow / CampaignHints).
 */
export interface CampaignProposal {
  /** Identifiant stable : `proposal:${channel}:${dimensionType}:${dimension}` */
  proposalId: string

  // ─── ciblage ──────────────────────────────────────────────────────────
  dimension: string
  dimensionType: "destination" | "productType"
  /** Canal ActionEngine (phone/whatsapp/email) */
  channel: ActionChannel
  /** Canal CRM compatible createCampaignCore */
  crmChannel: CrmChannel
  offerFocus: string

  // ─── audience ─────────────────────────────────────────────────────────
  /** Identifiants lead dédupliqués — à passer comme audience */
  leadIds: string[]
  leadCount: number

  // ─── priorité ─────────────────────────────────────────────────────────
  priority: ActionPriority
  topCombinedScore: number
  urgencyHours: number
  urgencyWindow: UrgencyWindow

  // ─── contenu prêt à créer ─────────────────────────────────────────────
  suggestedName: string
  suggestedObjective: string
  /** Template de message personnalisable par l'agent */
  suggestedMessage: string

  // ─── contexte marché ──────────────────────────────────────────────────
  marketTrend: SignalTrend
  marketGrowthRate: string

  // ─── méta ─────────────────────────────────────────────────────────────
  actionCount: number
}

/* -------------------------------------------------------------------------- */
/* Mapping ActionChannel → CrmChannel                                          */
/* -------------------------------------------------------------------------- */

const CHANNEL_MAP: Record<ActionChannel, CrmChannel> = {
  phone: "call",
  whatsapp: "whatsapp",
  email: "email",
}

/* -------------------------------------------------------------------------- */
/* Ordres de priorité pour le tri                                              */
/* -------------------------------------------------------------------------- */

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  urgent: 0,
  haute: 1,
  normale: 2,
  faible: 3,
}

/* -------------------------------------------------------------------------- */
/* Génération du contenu                                                       */
/* -------------------------------------------------------------------------- */

const TREND_LABEL: Record<SignalTrend, string> = {
  forte_hausse: "forte hausse",
  hausse: "en hausse",
  nouveau: "nouveau segment",
  stable: "stable",
  baisse: "en baisse",
  forte_baisse: "forte baisse",
}

function buildSuggestedName(
  offerFocus: string,
  channel: ActionChannel,
  priority: ActionPriority,
): string {
  const channelLabel =
    channel === "phone" ? "Appel" : channel === "whatsapp" ? "WhatsApp" : "Email"
  const priorityLabel = priority === "urgent" ? " 🔴" : priority === "haute" ? " 🟠" : ""
  return `VIP × ${offerFocus} — ${channelLabel}${priorityLabel}`
}

function buildSuggestedObjective(
  offerFocus: string,
  trend: SignalTrend,
  growthRate: string,
  leadCount: number,
): string {
  const growthPart =
    growthRate && growthRate !== "N/A" && growthRate !== "+∞"
      ? ` (${growthRate})`
      : ""
  return (
    `Convertir ${leadCount} contact${leadCount > 1 ? "s" : ""} VIP` +
    ` intéressés par ${offerFocus}` +
    ` — marché ${TREND_LABEL[trend]}${growthPart}.`
  )
}

function buildSuggestedMessage(
  offerFocus: string,
  channel: ActionChannel,
  trend: SignalTrend,
  growthRate: string,
): string {
  const trendStr = `${TREND_LABEL[trend]}${growthRate && growthRate !== "N/A" && growthRate !== "+∞" ? ` ${growthRate}` : ""}`

  switch (channel) {
    case "phone":
      return (
        `Bonjour [Prénom], je vous appelle au sujet de ${offerFocus}` +
        ` qui est en ${trendStr}. Nous avons une offre exclusive pour nos clients VIP —` +
        ` seriez-vous disponible pour en discuter ?`
      )
    case "whatsapp":
      return (
        `Bonjour [Prénom] 👋\n\n${offerFocus} affiche une ${trendStr}.` +
        ` En tant que client privilégié, vous bénéficiez d'une offre exclusive.` +
        ` Quand seriez-vous disponible pour en discuter ?`
      )
    case "email":
      return (
        `Bonjour [Prénom],\n\n` +
        `Nous avons le plaisir de vous informer qu'un mouvement ${trendStr}` +
        ` est en cours sur ${offerFocus}.\n\n` +
        `En tant que client VIP, vous bénéficiez d'un accès prioritaire` +
        ` à nos meilleures offres. Consultez nos disponibilités et contactez-nous.`
      )
  }
}

/* -------------------------------------------------------------------------- */
/* Core                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Fonction pure — groupe les ActionRow en CampaignProposal.
 *
 * Stratégie de groupement : (channel × dimensionType × dimension).
 * Dans chaque groupe, l'action au score le plus élevé est le "champion" —
 * son contenu sert de base au proposal. Les autres actions contribuent
 * leurs leadIds à l'audience.
 *
 * Ordre de sortie : priorité desc, puis combinedScore desc.
 */
export function buildCampaignEngineCore(actions: ActionRow[]): CampaignProposal[] {
  if (actions.length === 0) return []

  const groups = new Map<
    string,
    { champion: ActionRow; allActions: ActionRow[] }
  >()

  for (const action of actions) {
    const key = `${action.channel}:${action.dimensionType}:${action.dimension}`
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { champion: action, allActions: [action] })
    } else {
      existing.allActions.push(action)
      if (action.combinedScore > existing.champion.combinedScore) {
        existing.champion = action
      }
    }
  }

  const proposals: CampaignProposal[] = []

  for (const [, { champion, allActions }] of groups) {
    const leadIdSet = new Set<string>()
    for (const a of allActions) leadIdSet.add(a.leadId)
    const leadIds = Array.from(leadIdSet)

    const offerFocus = champion.offerFocus
    const channel = champion.channel
    const priority = champion.priority

    proposals.push({
      proposalId: `proposal:${channel}:${champion.dimensionType}:${champion.dimension}`,
      dimension: champion.dimension,
      dimensionType: champion.dimensionType,
      channel,
      crmChannel: CHANNEL_MAP[channel],
      offerFocus,
      leadIds,
      leadCount: leadIds.length,
      priority,
      topCombinedScore: champion.combinedScore,
      urgencyHours: champion.campaignHints.urgencyHours,
      urgencyWindow: champion.urgencyWindow,
      suggestedName: buildSuggestedName(offerFocus, channel, priority),
      suggestedObjective: buildSuggestedObjective(
        offerFocus,
        champion.campaignHints.marketTrend,
        champion.campaignHints.marketGrowthRate,
        leadIds.length,
      ),
      suggestedMessage: buildSuggestedMessage(
        offerFocus,
        channel,
        champion.campaignHints.marketTrend,
        champion.campaignHints.marketGrowthRate,
      ),
      marketTrend: champion.campaignHints.marketTrend,
      marketGrowthRate: champion.campaignHints.marketGrowthRate,
      actionCount: allActions.length,
    })
  }

  return proposals.sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      b.topCombinedScore - a.topCombinedScore,
  )
}
