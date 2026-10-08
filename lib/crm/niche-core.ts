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
 *
 * NICHE-SIGNAL-01 — détection de CONCENTRATION/IMPORTANCE RELATIVE sur
 * UNE SEULE période. `detectNicheSignalsCore` est une fonction pure, sans
 * DB, sans automatisation (aucun envoi d'alerte/notification).
 *
 * MISE EN GARDE EXPLICITE (ne pas confondre avec "émergence") : ce calcul
 * ne regarde qu'une période isolée — il ne peut PAS distinguer une niche
 * "qui vient d'apparaître/d'accélérer" d'une niche "grosse depuis
 * toujours". Un segment stable à 25% du volume depuis 10 périodes
 * déclenche ce signal exactement comme un segment apparu cette période-
 * ci — ce n'est PAS un signal d'émergence, seulement d'importance
 * actuelle. La détection d'émergence réelle (nouveauté, accélération,
 * variation dans le temps) nécessite une comparaison multi-période —
 * voir NICHE-TREND-01, hors scope ici, jamais construit par ce fichier.
 */

import { and, eq, gte, isNull, lt } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { leads } from "@/lib/db/schema"
import type {
  LeadRow,
  LeadProductType,
  LeadIntention,
  LeadMarket,
  LeadStatus,
} from "@/lib/crm/leads-core"

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

/**
 * NICHE-SIGNAL-01 — seuil par défaut, constante inspectable/testable (même
 * principe que LEAD_ORIGIN_SOURCE_TRUST), jamais une valeur magique codée
 * en dur dans la fonction elle-même. Part relative du volume de la
 * période, pas un volume absolu — s'adapte à la taille de l'agence.
 */
export const DEFAULT_NICHE_SIGNAL_THRESHOLD_PERCENT = 20

export interface NicheSignal extends NicheSegment {
  /** 0-100, arrondi — part de ce segment dans le volume total de sa période. */
  shareOfPeriod: number
}

/**
 * Fonction pure, sans DB, sans automatisation — détecte une concentration
 * sur UNE SEULE période (chaque segment n'est comparé qu'aux autres
 * segments de la MÊME période, jamais entre périodes différentes — ça,
 * c'est NICHE-TREND-01, hors scope ici).
 */
export function detectNicheSignalsCore(
  segments: NicheSegment[],
  thresholdPercent: number = DEFAULT_NICHE_SIGNAL_THRESHOLD_PERCENT,
): NicheSignal[] {
  const totalByPeriod = new Map<string, number>()
  for (const s of segments) {
    totalByPeriod.set(s.period, (totalByPeriod.get(s.period) ?? 0) + s.volume)
  }

  const signals: NicheSignal[] = []
  for (const s of segments) {
    const periodTotal = totalByPeriod.get(s.period) ?? 0
    const shareOfPeriod =
      periodTotal > 0 ? Math.round((s.volume / periodTotal) * 100) : 0
    if (shareOfPeriod >= thresholdPercent) {
      signals.push({ ...s, shareOfPeriod })
    }
  }

  return signals.sort((a, b) => b.shareOfPeriod - a.shareOfPeriod)
}

/**
 * NICHE-TREND-01 — étape 7 de la chaîne CAPTURE→...→LEARNING. Détecte une
 * variation d'un même segment (même dimension, hors période) entre deux
 * périodes CHRONOLOGIQUEMENT CONSÉCUTIVES — jamais entre deux périodes
 * arbitraires. Fonction pure, sans DB, sans automatisation.
 *
 * Classification à 4 sous-types ("kind"), jamais réduite à un simple % :
 *  - 0 → 0 : aucune tendance — exclu du résultat (rien à signaler).
 *  - 0 → N : "new" (apparition) — pas de `changePercent` (aucune base
 *    pour calculer un pourcentage depuis zéro).
 *  - N → 0 : "declining" à son extrême (-100%) — une disparition EST une
 *    décroissance, pas une catégorie séparée.
 *  - N → N : "growing" / "declining" / "stable" selon le signe et la
 *    magnitude de `changePercent`, départagés par
 *    DEFAULT_NICHE_TREND_STABLE_THRESHOLD_PERCENT (constante inspectable,
 *    pas une valeur magique) — une variation dont la valeur absolue est
 *    sous ce seuil est "stable", pas un faux signal de croissance/déclin.
 *
 * Les périodes "YYYY-MM" se trient correctement par simple comparaison
 * de chaînes (mois toujours sur 2 chiffres) — y compris au changement
 * d'année ("2026-12" < "2027-01") : pas besoin de parser les dates.
 */
export type NicheTrendKind = "new" | "growing" | "declining" | "stable"

/** Variation absolue sous ce seuil (%) = "stable", pas "growing"/"declining". */
export const DEFAULT_NICHE_TREND_STABLE_THRESHOLD_PERCENT = 5

export interface NicheTrend {
  market: string
  productType: string
  intention: string
  destination: string | null
  originAgencyId: string | null
  capturedByUserId: string | null
  channel: string | null
  campaignRef: string | null
  previousPeriod: string
  currentPeriod: string
  previousVolume: number
  currentVolume: number
  kind: NicheTrendKind
  /** null uniquement pour "new" (aucune base pour calculer un pourcentage depuis zéro). */
  changePercent: number | null
}

function dimensionKeyOf(s: NicheSegment): string {
  return [
    s.market,
    s.productType,
    s.intention,
    s.destination ?? "",
    s.originAgencyId ?? "",
    s.capturedByUserId ?? "",
    s.channel ?? "",
    s.campaignRef ?? "",
  ].join("|")
}

function dimensionFieldsOf(s: NicheSegment) {
  return {
    market: s.market,
    productType: s.productType,
    intention: s.intention,
    destination: s.destination,
    originAgencyId: s.originAgencyId,
    capturedByUserId: s.capturedByUserId,
    channel: s.channel,
    campaignRef: s.campaignRef,
  }
}

export function detectNicheTrendsCore(
  segments: NicheSegment[],
  stableThresholdPercent: number = DEFAULT_NICHE_TREND_STABLE_THRESHOLD_PERCENT,
): NicheTrend[] {
  const periods = [...new Set(segments.map((s) => s.period))].sort()

  const volumesByDimension = new Map<string, Map<string, number>>()
  const fieldsByDimension = new Map<
    string,
    ReturnType<typeof dimensionFieldsOf>
  >()

  for (const s of segments) {
    const key = dimensionKeyOf(s)
    if (!volumesByDimension.has(key)) {
      volumesByDimension.set(key, new Map())
      fieldsByDimension.set(key, dimensionFieldsOf(s))
    }
    const periodMap = volumesByDimension.get(key)!
    periodMap.set(s.period, (periodMap.get(s.period) ?? 0) + s.volume)
  }

  const trends: NicheTrend[] = []
  for (const [key, periodVolumes] of volumesByDimension) {
    const fields = fieldsByDimension.get(key)!
    for (let i = 1; i < periods.length; i++) {
      const previousPeriod = periods[i - 1]!
      const currentPeriod = periods[i]!
      const previousVolume = periodVolumes.get(previousPeriod) ?? 0
      const currentVolume = periodVolumes.get(currentPeriod) ?? 0

      if (previousVolume === 0 && currentVolume === 0) continue

      let kind: NicheTrendKind
      let changePercent: number | null
      if (previousVolume === 0) {
        kind = "new"
        changePercent = null
      } else {
        changePercent = Math.round(
          ((currentVolume - previousVolume) / previousVolume) * 100,
        )
        if (currentVolume === 0) {
          kind = "declining" // -100%, disparition = décroissance extrême
        } else if (Math.abs(changePercent) < stableThresholdPercent) {
          kind = "stable"
        } else if (changePercent > 0) {
          kind = "growing"
        } else {
          kind = "declining"
        }
      }

      trends.push({
        ...fields,
        previousPeriod,
        currentPeriod,
        previousVolume,
        currentVolume,
        kind,
        changePercent,
      })
    }
  }

  return trends
}

/**
 * NICHE-AUDIENCE-01 — étape 8 de la chaîne CAPTURE→...→LEARNING. Transforme
 * un segment NICHE agrégé (compteur) en liste de LeadRow réels — réutilise
 * EXACTEMENT les mêmes champs de dimension que NicheSegment (+ période),
 * jamais une requête inventée séparément.
 *
 * GARDE-FOUS (vie privée + sécurité, vérifiés par tests dédiés) :
 *  - `agencyId` toujours dans le WHERE — jamais une audience cross-tenant.
 *  - Cohérence mathématique attendue par l'appelant : pour les MÊMES
 *    dimensions + période, `audience.length === segment.volume` — testé
 *    par comparaison directe avec `computeNicheSegmentsCore` sur le même
 *    jeu de leads.
 *  - PAS de garde d'autorisation ICI (fonction core, comme tout le reste
 *    de ce fichier) — l'autorisation staff-only est de la responsabilité
 *    de l'appelant (voir lib/admin/niche-actions.ts::assertSupportStaff,
 *    exécutée AVANT tout appel à cette fonction).
 *  - HORS SCOPE strict : aucune sélection de canal, aucun envoi, aucun
 *    export, aucun ciblage publicitaire, aucun consentement marketing
 *    inventé — cette fonction ne fait QUE lire des LeadRow, rien de plus.
 */
export interface NicheAudienceFilter {
  agencyId: string
  market: string
  productType: string
  intention: string
  destination: string | null
  originAgencyId: string | null
  capturedByUserId: string | null
  channel: string | null
  campaignRef: string | null
  /** "YYYY-MM" — même format que NicheSegment.period. */
  period: string
}

/** Bornes [début, fin) du mois calendaire désigné par "YYYY-MM", en UTC — même découpage que toPeriodKey(). */
function periodBoundsUtc(period: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = period.split("-")
  const year = Number(yearStr)
  const month = Number(monthStr) // 1-12
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  }
}

function eqOrNull<T>(
  column: Parameters<typeof eq>[0],
  value: T | null,
): ReturnType<typeof eq> | ReturnType<typeof isNull> {
  return value === null ? isNull(column) : eq(column, value)
}

export async function getNicheAudienceCore(
  tx: DrizzleTransaction,
  filter: NicheAudienceFilter,
): Promise<LeadRow[]> {
  const { start, end } = periodBoundsUtc(filter.period)

  const rows = await tx
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.agencyId, filter.agencyId),
        eq(leads.market, filter.market),
        eq(leads.productType, filter.productType),
        eq(leads.intention, filter.intention),
        eqOrNull(leads.destination, filter.destination),
        eqOrNull(leads.originAgencyId, filter.originAgencyId),
        eqOrNull(leads.capturedByUserId, filter.capturedByUserId),
        eqOrNull(leads.channel, filter.channel),
        eqOrNull(leads.campaignRef, filter.campaignRef),
        gte(leads.createdAt, start),
        lt(leads.createdAt, end),
      ),
    )

  return rows.map((r) => ({
    ...r,
    productType: r.productType as LeadProductType,
    intention: r.intention as LeadIntention,
    market: r.market as LeadMarket,
    status: r.status as LeadStatus,
  }))
}
