/**
 * VIP-SCORE-01 — thermomètre de valeur commerciale, PAS un verdict VIP.
 *
 * Audit préalable (docs/ROADMAP.md, "NICHE CRM & VIP LEAD ENGINE") :
 * aucune formule de score de valeur commerciale n'existait avant ce
 * chantier — `lead-scoring-core.ts` existant est un score de QUALITÉ de
 * formulaire (coordonnées complètes, message rédigé...), orthogonal à la
 * valeur commerciale, réutilisé ici tel quel comme UN signal parmi
 * d'autres, jamais confondu avec elle.
 *
 * Portée strictement limitée (décision explicite de l'utilisateur,
 * 2026-10-07) :
 *  - fonction pure, calculée À LA DEMANDE, jamais persistée ;
 *  - uniquement des données déjà réelles et déjà en base (leads,
 *    reservations, customers, reservationFinancials, lead-scoring) ;
 *  - breakdown explicable signal par signal (même discipline que
 *    `computeLeadScore`, lib/crm/lead-scoring-core.ts) ;
 *  - AUCUN seuil VIP ici. Ce fichier produit un nombre ; décider où
 *    commence la "zone VIP" est un chantier séparé, après analyse de la
 *    distribution réelle des scores produits sur la base existante —
 *    jamais une valeur arbitraire choisie à l'avance.
 *  - AUCUNE nouvelle table, aucune migration : les poids ci-dessous sont
 *    des constantes de calibration provisoires du thermomètre
 *    (inspectables/ajustables en code, même esprit que
 *    DEFAULT_NICHE_SIGNAL_THRESHOLD_PERCENT, lib/crm/niche-core.ts), pas
 *    une décision produit figée.
 *  - hors scope explicite : IA, Contact Graph relationnel, intention
 *    comportementale, partner referral structuré, toute automatisation.
 *
 * Résolution au niveau LEAD (pas CONTACT) : `contacts` (CONTACT-01) ne
 * fusionne jamais deux points de contact entre eux (un même email et un
 * même numéro WhatsApp restent deux lignes distinctes, par conception) —
 * en déduire une identité "personne" unique serait une fusion silencieuse
 * que ce dépôt refuse explicitement ailleurs (voir contact-core.ts). Un
 * `LeadRow` porte déjà email ET téléphone, exactement le même
 * rapprochement déjà utilisé par `searchReservationsForLeadLinkCore`
 * (lib/crm/leads-core.ts) et `getCustomer360Core`
 * (lib/admin/customer-360-core.ts) — jamais une troisième méthode de
 * rapprochement inventée ici.
 *
 * VIP-SCORE-02 — signal "engagement" : nombre de demandes historiques du
 * même CONTACT (`getContactLeadHistoryCore`, lib/crm/contact-history-core.ts),
 * fermant le gap identifié dans l'audit initial ("répétition"/"engagement"
 * explicitement listés mais reportés tant que CONTACT-LEAD-HISTORY-01
 * n'existait pas). Lecture SEULE du contact existant — jamais de création
 * (`resolveOrCreateContactCore` n'est jamais appelé ici : calculer un score
 * ne doit jamais avoir d'effet de bord sur les données). Si aucun contact
 * n'a encore été persisté pour ce lead (aucun des flux de capture ne l'a
 * encore résolu), `engagementLeadCount` vaut 1 (ce lead lui-même, jamais 0
 * ni null) — pas de régression silencieuse par rapport à l'absence de ce
 * signal avant VIP-SCORE-02.
 *
 * Réservations exclues du calcul de valeur commerciale : 'cancelled',
 * 'expired', 'refunded' — aucune argent réellement resté dans l'activité
 * pour ces statuts. Raffinement explicitement HORS SCOPE ici : un
 * remboursement PARTIEL sur une réservation par ailleurs 'completed'
 * resterait compté en entier (contrairement à
 * `getReservationPaymentSummary().collectedTnd`, lib/finance/
 * payment-summary.ts, utilisé par lib/loyalty/rewards-core.ts pour un
 * calcul net exact) — ce fichier est un premier thermomètre volontairement
 * simple, pas une seconde vérité financière.
 */

import { and, eq, or, notInArray, desc } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  contacts,
  customers,
  reservations,
  reservationFinancials,
} from "@/lib/db/schema"
import { getLeadCore, type LeadRow } from "./leads-core"
import { computeLeadScore, type LeadScoreRuleMap } from "./lead-scoring-core"
import { resolveContactKeyCore } from "./contact-core"
import { getContactLeadHistoryCore } from "./contact-history-core"

/** Statuts où aucune valeur commerciale n'est restée dans l'activité. */
const VIP_SCORE_EXCLUDED_RESERVATION_STATUSES = [
  "cancelled",
  "expired",
  "refunded",
] as const

export interface VipScoreSignals {
  /** 0-100, computeLeadScore(lead, rules).total — réutilisé tel quel. */
  leadQualityScore: number
  /** Réservations non exclues (voir VIP_SCORE_EXCLUDED_RESERVATION_STATUSES). */
  reservationCount: number
  /** Somme reservationFinancials.salePriceTnd des réservations non exclues. */
  totalSalePriceTnd: number
  /** Somme reservationFinancials.marginAmount des réservations non exclues. */
  totalMarginTnd: number
  /** Jours depuis la plus récente activité (lead ou réservation) ; null = aucune activité connue. */
  daysSinceLastActivity: number | null
  /** VIP-SCORE-02 — nombre de demandes historiques du même CONTACT, ce lead inclus. Jamais 0 (ce lead compte toujours pour 1). */
  engagementLeadCount: number
}

export interface VipScoreWeights {
  /** Points par point de leadQualityScore (0-100) — défaut 0.3 → jusqu'à 30 points. */
  leadQualityPointsPerUnit: number
  /** Points par réservation non exclue — défaut 10. */
  pointsPerReservation: number
  /** Points par 100 TND de chiffre d'affaires cumulé — défaut 1. */
  pointsPer100TndSale: number
  /** Points par 100 TND de marge cumulée — défaut 3 (la marge compte plus que le CA brut, c'est la valeur réellement captée). */
  pointsPer100TndMargin: number
  /** Points pleins si activité aujourd'hui, décroissance linéaire jusqu'à 0 — défaut 20. */
  recencyMaxPoints: number
  /** Horizon (jours) au-delà duquel la récence ne contribue plus rien — défaut 365. */
  recencyHorizonDays: number
  /** VIP-SCORE-02 — points par demande RÉPÉTÉE du même contact (engagementLeadCount - 1, jamais le premier lead lui-même) — défaut 5. */
  pointsPerEngagementLead: number
}

/**
 * Calibration provisoire du thermomètre — PAS une décision produit figée.
 * À réviser une fois la distribution réelle des scores observée (voir
 * l'en-tête de ce fichier).
 */
export const DEFAULT_VIP_SCORE_WEIGHTS: VipScoreWeights = {
  leadQualityPointsPerUnit: 0.3,
  pointsPerReservation: 10,
  pointsPer100TndSale: 1,
  pointsPer100TndMargin: 3,
  recencyMaxPoints: 20,
  recencyHorizonDays: 365,
  pointsPerEngagementLead: 5,
}

export interface VipScoreBreakdownItem {
  signal:
    | "lead_quality"
    | "recurrence"
    | "commercial_value_sale"
    | "commercial_value_margin"
    | "recency"
    | "engagement"
  /** Valeur brute du signal, pour affichage/audit — jamais masquée. */
  rawValue: number | null
  points: number
}

export interface VipScore {
  total: number
  breakdown: VipScoreBreakdownItem[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Fonction pure — un même jeu de signaux produit toujours le même score
 * (reproductible, testable sans DB). Breakdown toujours retourné en
 * entier, jamais un total opaque (même discipline que `computeLeadScore`).
 */
export function computeVipScoreCore(
  signals: VipScoreSignals,
  weights: VipScoreWeights = DEFAULT_VIP_SCORE_WEIGHTS,
): VipScore {
  const leadQualityPoints = round2(
    signals.leadQualityScore * weights.leadQualityPointsPerUnit,
  )
  const recurrencePoints = round2(
    signals.reservationCount * weights.pointsPerReservation,
  )
  const salePoints = round2(
    (signals.totalSalePriceTnd / 100) * weights.pointsPer100TndSale,
  )
  const marginPoints = round2(
    (signals.totalMarginTnd / 100) * weights.pointsPer100TndMargin,
  )
  const recencyPoints =
    signals.daysSinceLastActivity === null
      ? 0
      : round2(
          Math.max(
            0,
            weights.recencyMaxPoints *
              (1 - signals.daysSinceLastActivity / weights.recencyHorizonDays),
          ),
        )
  // Seules les demandes RÉPÉTÉES comptent (engagementLeadCount - 1) — le
  // premier lead lui-même ne vaut pas un point d'engagement en plus de
  // son propre lead_quality, sinon le signal doublerait "le fait d'être
  // un lead" au lieu de mesurer la répétition.
  const engagementPoints = round2(
    Math.max(0, signals.engagementLeadCount - 1) *
      weights.pointsPerEngagementLead,
  )

  const breakdown: VipScoreBreakdownItem[] = [
    {
      signal: "lead_quality",
      rawValue: signals.leadQualityScore,
      points: leadQualityPoints,
    },
    {
      signal: "recurrence",
      rawValue: signals.reservationCount,
      points: recurrencePoints,
    },
    {
      signal: "commercial_value_sale",
      rawValue: signals.totalSalePriceTnd,
      points: salePoints,
    },
    {
      signal: "commercial_value_margin",
      rawValue: signals.totalMarginTnd,
      points: marginPoints,
    },
    {
      signal: "recency",
      rawValue: signals.daysSinceLastActivity,
      points: recencyPoints,
    },
    {
      signal: "engagement",
      rawValue: signals.engagementLeadCount,
      points: engagementPoints,
    },
  ]

  const total = round2(breakdown.reduce((sum, item) => sum + item.points, 0))
  return { total, breakdown }
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * VIP-SCORE-02 — recherche d'un CONTACT-01 déjà persisté pour ce lead,
 * LECTURE SEULE (jamais `resolveOrCreateContactCore` : calculer un score
 * ne doit jamais créer de donnée). Un numéro de téléphone peut avoir été
 * résolu sous 'whatsapp' OU 'call' selon le flux de capture d'origine
 * (lib/crm/inbox-core.ts vs lib/meta-leadads/lead-capture-core.ts) — les
 * deux sont essayés, jamais une troisième taxonomie de canal inventée.
 * `null` si aucun contact n'a encore été persisté pour ce lead (flux de
 * capture qui n'a pas encore résolu CONTACT-01, ou lead sans email/
 * téléphone) — jamais une erreur, jamais un contact fabriqué.
 */
async function findExistingContactIdForLeadCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; email: string | null; phone: string | null },
): Promise<string | null> {
  const candidates: Array<{
    channel: "email" | "whatsapp" | "call"
    raw: string
  }> = []
  if (params.email) candidates.push({ channel: "email", raw: params.email })
  if (params.phone) {
    candidates.push({ channel: "whatsapp", raw: params.phone })
    candidates.push({ channel: "call", raw: params.phone })
  }

  for (const candidate of candidates) {
    const contactRef = resolveContactKeyCore(candidate.channel, candidate.raw)
    const [found] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.agencyId, params.agencyId),
          eq(contacts.channel, candidate.channel),
          eq(contacts.contactRef, contactRef),
        ),
      )
      .limit(1)
    if (found) return found.id
  }

  return null
}

/**
 * Seul point de contact DB — résout les signaux réels d'un lead (même
 * rapprochement email/téléphone que `searchReservationsForLeadLinkCore`),
 * puis délègue tout le calcul à `computeVipScoreCore` (jamais de logique
 * dupliquée). `now` injectable pour les tests (reproductibilité).
 */
export async function getVipScoreForLeadCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    leadId: string
    scoreRules: LeadScoreRuleMap
    weights?: VipScoreWeights
    now?: Date
  },
): Promise<{ lead: LeadRow; score: VipScore } | null> {
  const lead = await getLeadCore(tx, {
    agencyId: params.agencyId,
    id: params.leadId,
  })
  if (!lead) return null

  const leadQualityScore = computeLeadScore(lead, params.scoreRules).total

  const matchClause = or(
    lead.email ? eq(customers.email, lead.email) : undefined,
    lead.phone ? eq(customers.phone, lead.phone) : undefined,
  )

  const reservationRows = matchClause
    ? await tx
        .select({
          createdAt: reservations.createdAt,
          salePriceTnd: reservationFinancials.salePriceTnd,
          marginAmount: reservationFinancials.marginAmount,
        })
        .from(reservations)
        .innerJoin(customers, eq(customers.id, reservations.customerId))
        .innerJoin(
          reservationFinancials,
          eq(reservationFinancials.reservationId, reservations.id),
        )
        .where(
          and(
            eq(reservations.agencyId, params.agencyId),
            matchClause,
            notInArray(reservations.status, [
              ...VIP_SCORE_EXCLUDED_RESERVATION_STATUSES,
            ]),
          ),
        )
        .orderBy(desc(reservations.createdAt))
    : []

  const totalSalePriceTnd = reservationRows.reduce(
    (sum, r) => sum + Number(r.salePriceTnd),
    0,
  )
  const totalMarginTnd = reservationRows.reduce(
    (sum, r) => sum + Number(r.marginAmount),
    0,
  )

  const now = params.now ?? new Date()
  const lastActivityAt = reservationRows[0]?.createdAt ?? null
  const mostRecentAt =
    lastActivityAt && lastActivityAt.getTime() > lead.createdAt.getTime()
      ? lastActivityAt
      : lead.createdAt
  const daysSinceLastActivity = daysBetween(mostRecentAt, now)

  const existingContactId = await findExistingContactIdForLeadCore(tx, {
    agencyId: params.agencyId,
    email: lead.email,
    phone: lead.phone,
  })
  const engagementLeadCount = existingContactId
    ? (
        await getContactLeadHistoryCore(tx, {
          agencyId: params.agencyId,
          contactId: existingContactId,
        })
      ).length || 1
    : 1

  const signals: VipScoreSignals = {
    leadQualityScore,
    reservationCount: reservationRows.length,
    totalSalePriceTnd,
    totalMarginTnd,
    daysSinceLastActivity,
    engagementLeadCount,
  }

  return {
    lead,
    score: computeVipScoreCore(signals, params.weights),
  }
}
