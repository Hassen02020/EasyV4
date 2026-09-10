/**
 * PHASE 34 — recherche à dates flexibles (±N jours autour des dates
 * demandées), backend/orchestration UNIQUEMENT — jamais côté frontend.
 *
 * Principe : le mode classique (checkin/checkout fixes) reste
 * STRICTEMENT inchangé — ce module n'est appelé que si l'appelant demande
 * explicitement `flexDays > 0`, et n'introduit AUCUNE modification au
 * pipeline `runSearchThroughHub()`/`runHotelSearch()` existant. Chaque
 * candidat de date est une recherche RÉELLEMENT exécutée à travers le
 * Universal Supplier Hub (`runSearchThroughHub`, lib/hotel-suppliers/
 * search-hub.ts) — jamais un appel MyGo direct, jamais un prix/une
 * disponibilité inventés. Un candidat sans offre réelle reste `ok: true,
 * offersCount: 0` (recherche réussie, zéro résultat) — jamais confondu
 * avec un échec, et jamais affiché comme "disponible".
 *
 * La réservation reste hors de ce module : un candidat n'est qu'un résumé
 * de comparaison (prix le plus bas réellement trouvé pour ces dates). Pour
 * réserver une date candidate, le client relance une recherche classique
 * sur ces dates précises (même pipeline, même CheckRate policy, même
 * Booking Core — aucune réservation n'est jamais créée depuis une date
 * "reconstruite" ici).
 */

import type { HotelSearchQuery } from "@/lib/mygo/search-core"
import { validateSearchDateRange } from "@/lib/mygo/search-core"
import { selectBestRate } from "@/lib/mygo/best-rate"
import type { HotelOfferDTO } from "@/lib/mygo/types"
import { runSearchThroughHub } from "./search-hub"
import type { ResolvedMyGoAccess } from "./tenant/live-resolution"

/**
 * PHASE 37 — prix le plus bas RÉELLEMENT affichable pour une date candidate,
 * parmi toutes les offres réellement renvoyées par le Hub pour cette date.
 * Pure, extraite pour être testable indépendamment de tout appel réseau.
 *
 * Confirmé en environnement réel : un hôtel dont TOUTES les chambres sont
 * `stopReservation` (complet/sur demande pour ces dates) a
 * `offer.fromPrice === 0` (sentinelle "aucune chambre réservable", voir
 * lib/mygo/mappers.ts::lowestPrice — exclut volontairement les chambres
 * stopReservation du calcul). Un simple `Math.min` sur les `fromPrice` bruts
 * laissait ce 0 l'emporter et s'afficher comme "dès 0 DT — Meilleur prix"
 * pour toute la fenêtre de dates flexibles. On réutilise EXACTEMENT le même
 * Best Rate Engine que la card SERP (components/hotel-listings.tsx::
 * toCardShape → selectBestRate, lib/mygo/best-rate.ts) plutôt qu'une
 * seconde logique de prix : prix indicatif le plus bas quand aucune chambre
 * n'est réservable, jamais 0 pour une offre qui a réellement des chambres.
 * `undefined` quand aucune offre n'a de prix exploitable (jamais fabriqué).
 */
export function lowestDisplayPrice(offers: HotelOfferDTO[]): number | undefined {
  const prices = offers
    .map((o) => selectBestRate(o)?.price ?? o.fromPrice)
    .filter((p) => p > 0)
  return prices.length > 0 ? Math.min(...prices) : undefined
}

/**
 * Fenêtre maximale — ancrée sur les exemples explicitement demandés
 * (±1/±2/±3 jours) : au-delà, le nombre d'appels fournisseur réels par
 * requête utilisateur (2×flexDays+1, un seul fournisseur réel — MyGo — à
 * ce jour) croît trop vite pour une seule requête HTTP. ±3 jours = 7
 * candidats = 7 appels MyGo réels au maximum par requête, soit ~12% du
 * budget par défaut du rate-limiter existant (60 req/60s/IP, voir
 * lib/rate-limit.ts) — une fraction raisonnable, pas une explosion.
 */
export const MAX_FLEX_DAYS = 3

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export interface FlexibleDateCandidate {
  checkin: string
  checkout: string
  /** Décalage en jours par rapport à la date demandée (0 = date exacte demandée, incluse pour permettre une comparaison directe). */
  offsetDays: number
}

/**
 * Génère les couples checkin/checkout candidats autour des dates demandées,
 * en conservant TOUJOURS le même nombre de nuits que la requête d'origine
 * (jamais un séjour raccourci/allongé pour "faire rentrer" une date).
 * Pure — aucun I/O, testable indépendamment de tout appel réseau.
 * Exclut les candidats dont la date d'arrivée tomberait dans le passé, et
 * ceux qui échoueraient la même validation que la recherche classique
 * (`validateSearchDateRange`) — jamais une date invalide envoyée au Hub.
 */
export function generateFlexibleDateCandidates(
  checkin: string,
  checkout: string,
  flexDays: number,
  opts: { maxNights?: number; nowMs?: number } = {},
): FlexibleDateCandidate[] {
  const clampedFlex = Math.max(0, Math.min(MAX_FLEX_DAYS, Math.round(flexDays)))
  const checkinMs = Date.parse(`${checkin}T00:00:00Z`)
  const checkoutMs = Date.parse(`${checkout}T00:00:00Z`)
  if (!Number.isFinite(checkinMs) || !Number.isFinite(checkoutMs) || checkoutMs <= checkinMs) {
    return []
  }
  const nightsMs = checkoutMs - checkinMs
  const now = opts.nowMs ?? Date.now()
  // Minuit UTC du jour courant — une arrivée "aujourd'hui" reste valide,
  // seul le passé strict est exclu (même repère que le reste de l'app).
  const todayMidnightMs = Math.floor(now / 86_400_000) * 86_400_000

  const candidates: FlexibleDateCandidate[] = []
  for (let rawOffset = -clampedFlex; rawOffset <= clampedFlex; rawOffset++) {
    // Normalise -0 en 0 (ex. flexDays=0 : `-0 === 0` en JS mais
    // `Object.is`/`assert.strictEqual` les distinguent).
    const offset = rawOffset === 0 ? 0 : rawOffset
    const candCheckinMs = checkinMs + offset * 86_400_000
    if (candCheckinMs < todayMidnightMs) continue
    const candCheckoutMs = candCheckinMs + nightsMs
    const candCheckin = toIsoDate(candCheckinMs)
    const candCheckout = toIsoDate(candCheckoutMs)
    const validation = validateSearchDateRange(candCheckin, candCheckout, opts.maxNights)
    if (!validation.ok) continue
    candidates.push({ checkin: candCheckin, checkout: candCheckout, offsetDays: offset })
  }
  return candidates
}

export interface FlexibleSearchCandidateResult extends FlexibleDateCandidate {
  ok: boolean
  /** Plus bas `fromPrice` réellement renvoyé par le Hub pour ces dates — jamais recalculé/estimé. */
  fromPrice?: number
  currency?: string
  /** Nombre d'offres réellement renvoyées — `0` est un résultat honnête (recherche réussie, aucune offre), pas une erreur. */
  offersCount?: number
  error?: string
  message?: string
}

export interface FlexibleSearchResult {
  requestedCheckin: string
  requestedCheckout: string
  flexDays: number
  candidates: FlexibleSearchCandidateResult[]
}

/**
 * Exécute une recherche par candidat en parallèle via le Universal Hub
 * (`runSearchThroughHub`, jamais MyGo directement) — `Promise.allSettled`
 * pour qu'un échec/timeout sur UN candidat n'annule jamais les autres
 * (résilience aux pannes partielles, comme demandé). Chaque candidat est
 * indépendamment tenant-résolu avec le MÊME `access` que l'appelant (aucune
 * seconde résolution de compte fournisseur).
 */
export async function runFlexibleHotelSearch(
  q: HotelSearchQuery,
  flexDays: number,
  access?: ResolvedMyGoAccess,
  correlationId?: string,
): Promise<FlexibleSearchResult> {
  const clampedFlex = Math.max(0, Math.min(MAX_FLEX_DAYS, Math.round(flexDays)))
  const candidates = generateFlexibleDateCandidates(q.checkin, q.checkout, clampedFlex)

  const settled = await Promise.allSettled(
    candidates.map((c) =>
      runSearchThroughHub({ ...q, checkin: c.checkin, checkout: c.checkout }, access, correlationId),
    ),
  )

  const results: FlexibleSearchCandidateResult[] = settled.map((s, i) => {
    const c = candidates[i]!
    if (s.status === "rejected") {
      const reason = s.reason
      return {
        ...c,
        ok: false,
        error: "SEARCH_FAILED",
        message: reason instanceof Error ? reason.message : String(reason),
      }
    }
    const { runResult } = s.value
    if (!runResult.ok) {
      return { ...c, ok: false, error: runResult.error, message: runResult.message }
    }
    const offers = runResult.dto.offers
    if (offers.length === 0) {
      return { ...c, ok: true, offersCount: 0 }
    }
    const fromPrice = lowestDisplayPrice(offers)
    if (fromPrice === undefined) {
      return { ...c, ok: true, offersCount: offers.length }
    }
    return {
      ...c,
      ok: true,
      fromPrice,
      currency: offers[0]!.currency,
      offersCount: offers.length,
    }
  })

  return {
    requestedCheckin: q.checkin,
    requestedCheckout: q.checkout,
    flexDays: clampedFlex,
    candidates: results,
  }
}
