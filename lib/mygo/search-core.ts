/**
 * Shared Hotel Search Engine — moteur de recherche unique partagé par les
 * deux points d'entrée :
 *   - `/api/hotels/search`        (B2B, `requirePartnerSession` obligatoire)
 *   - `/api/hotels/search-public` (B2C, aucune session requise)
 *
 * Ce module ne fait AUCUNE vérification d'authentification/autorisation —
 * c'est strictement la responsabilité de chaque `route.ts` appelant, AVANT
 * d'appeler `executeHotelSearch`. Ce fichier ne valide que les paramètres de
 * RECHERCHE eux-mêmes (destination, dates, occupation...) et exécute la
 * recherche myGo (repli démo/dégradé inclus) — identique quel que soit
 * l'appelant, pour ne jamais dupliquer la logique MyGo.
 *
 * Aucun prix, markup, commission, agency_id, wallet_id ou partner_id n'est
 * lu depuis la requête cliente ici — `HotelSearchQuerySchema` ne contient
 * aucun de ces champs, et myGo lui-même ne renvoie que son propre prix
 * autoritaire (`fromPrice`), jamais un prix fourni par le client. Voir
 * EASYV4_B2C_PUBLIC_SEARCH_REPORT.md pour le détail de cette frontière.
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import {
  getMyGoClient,
  isRealHotelOffer,
  mapHotelOffer,
  dedupeOffersByHotelId,
  MyGoAuthError,
  MyGoError,
} from "./index"
import { HotelSearchResponse } from "./schemas"
import type { HotelSearchResultDTO } from "./types"
import hotelSearchFixture from "./__fixtures__/hotelsearch.json"
import { decodeRoomsParam } from "./room-split"
import { instrument } from "../observability/instrument"
import { searchWithFallback } from "./degraded-mode"

export const isDemoMode = () =>
  !process.env.MYGO_LOGIN || process.env.MYGO_LOGIN.length === 0

/**
 * Nombre maximal de nuits accepté — garde-fou anti-abus (une requête avec
 * un séjour de plusieurs années n'a aucun sens métier réel et ne fait que
 * gonfler inutilement la charge sur myGo). 60 nuits reste largement au-delà
 * de tout séjour réel (Omra, voyages longs inclus).
 */
export const MAX_SEARCH_NIGHTS = 60

export const HotelSearchQuerySchema = z.object({
  cityId: z.coerce.number().int().positive(),
  checkin: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "checkin must be YYYY-MM-DD"),
  checkout: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "checkout must be YYYY-MM-DD"),
  adults: z.coerce.number().int().min(1).max(8).default(2),
  children: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(",")
            .map((x) => parseInt(x, 10))
            .filter((n) => Number.isFinite(n) && n >= 0 && n <= 17)
        : [],
    ),
  currency: z.string().optional(),
  stars: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(",")
            .map((x) => parseInt(x, 10))
            .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5)
        : [],
    ),
  onlyAvailable: z
    .union([
      z.literal("0"),
      z.literal("1"),
      z.literal("true"),
      z.literal("false"),
    ])
    .optional()
    .transform((v) => v === "1" || v === "true"),
  hotelId: z.coerce.number().int().positive().optional(),
  // Multi-room réel — encodage compact "adultes-age1.age2|adultes|..." (une
  // chambre par segment séparé par "|"). Le connecteur myGo accepte déjà
  // nativement `rooms: {adults, childAges}[]` (voir lib/mygo/client.ts,
  // `SearchDetails.Rooms`) : ce champ n'ajoute aucune capacité fictive, il
  // se contente d'exposer un paramètre déjà supporté par le fournisseur.
  // Absent → repli sur `adults`/`children` (une seule chambre, comportement
  // historique inchangé).
  rooms: z
    .string()
    .optional()
    .transform((s) => {
      if (!s) return null
      const parsed = decodeRoomsParam(s)
      return parsed.length > 0 ? parsed : null
    }),
})

export type HotelSearchQuery = z.infer<typeof HotelSearchQuerySchema>

export interface DateRangeValidation {
  ok: boolean
  error?: "invalid_dates" | "date_range_too_long"
  message?: string
}

/**
 * Valide checkout > checkin et un nombre de nuits raisonnable. Fonction pure
 * — testable indépendamment de tout contexte HTTP.
 */
export function validateSearchDateRange(
  checkin: string,
  checkout: string,
  maxNights: number = MAX_SEARCH_NIGHTS,
): DateRangeValidation {
  const inMs = Date.parse(`${checkin}T00:00:00Z`)
  const outMs = Date.parse(`${checkout}T00:00:00Z`)
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs) || outMs <= inMs) {
    return {
      ok: false,
      error: "invalid_dates",
      message: "checkout must be after checkin",
    }
  }
  const nights = Math.round((outMs - inMs) / 86_400_000)
  if (nights > maxNights) {
    return {
      ok: false,
      error: "date_range_too_long",
      message: `Séjour trop long (${nights} nuits, maximum ${maxNights})`,
    }
  }
  return { ok: true }
}

/**
 * Résultat "données pures" d'une recherche myGo — sans mise en forme HTTP
 * (pas de `NextResponse`, pas de headers). Permet à un Server Component
 * (ex. `/pro/(app)/hotels/page.tsx`, Phase 8) d'appeler directement le
 * moteur partagé sans passer par un aller-retour HTTP vers sa propre route
 * API — tout en restant l'unique implémentation (route handlers ET Server
 * Components appellent ce même code, jamais deux moteurs distincts).
 */
export type HotelSearchRunResult =
  | {
      ok: true
      dto: HotelSearchResultDTO
      degraded: boolean
      degradedReason?: string
      fromStaleCache: boolean
      isDemoMode?: boolean
    }
  | {
      ok: false
      status: number
      error: string
      message?: string
      retryAfterSeconds?: number
    }

/**
 * Exécute la recherche myGo pour une query déjà validée (schéma + dates) et
 * renvoie un résultat pur (démo, dégradé, ou résultats réels dédupliqués).
 * Ni authentification ni rate-limiting ici — la responsabilité de
 * l'appelant (`route.ts` ou Server Component).
 */
export async function runHotelSearch(
  q: HotelSearchQuery,
): Promise<HotelSearchRunResult> {
  if (isDemoMode()) {
    return demoSearchResult(q.cityId)
  }
  return runRealHotelSearch(q)
}

async function runRealHotelSearch(
  q: HotelSearchQuery,
): Promise<HotelSearchRunResult> {

  const searchInput = {
    cityId: q.cityId,
    checkIn: q.checkin,
    checkOut: q.checkout,
    currency: q.currency ?? "TND",
    hotelId: q.hotelId,
    rooms: (q.rooms ?? [{ adults: q.adults, childAges: q.children }]) as {
      adults: number
      childAges?: number[]
    }[],
    filters: {
      onlyAvailable: q.onlyAvailable ?? true,
      ...(q.stars.length ? { categories: q.stars } : {}),
    },
  }

  const fallbackResult = await searchWithFallback(searchInput, () =>
    instrument("mygo.search", () => getMyGoClient().searchHotels(searchInput)),
  )

  if (fallbackResult.degraded) {
    // Mode dégradé : sert le stale cache ou une erreur 503 propre
    const stale = fallbackResult.staleData
    if (stale) {
      const s = stale as unknown as {
        hotels: ReturnType<typeof mapHotelOffer>[]
        searchId: string | null
        count: number
      }
      const dto: HotelSearchResultDTO = {
        searchId: s.searchId ?? undefined,
        count: s.count,
        offers: Array.isArray(s.hotels) ? s.hotels : [],
      }
      return {
        ok: true,
        dto,
        degraded: true,
        degradedReason: fallbackResult.reason,
        fromStaleCache: false,
      }
    }
    return {
      ok: false,
      status: 503,
      error: "service_unavailable",
      message:
        "Le service hôtelier est temporairement indisponible. Veuillez réessayer dans quelques instants.",
      retryAfterSeconds: 120,
    }
  }

  const result = fallbackResult.data
  try {
    const rawOffers = result.hotels.filter(isRealHotelOffer).map(mapHotelOffer)
    const offers = dedupeOffersByHotelId(rawOffers)
    const dto: HotelSearchResultDTO = {
      searchId: result.searchId ?? undefined,
      count: offers.length,
      offers,
    }
    return {
      ok: true,
      dto,
      degraded: false,
      fromStaleCache: fallbackResult.fromStaleCache,
    }
  } catch (err) {
    return mapErrorToRunResult(err)
  }
}

/**
 * Exécute la recherche myGo et renvoie directement la réponse HTTP prête à
 * l'emploi — utilisé par les route handlers (`/api/hotels/search*`).
 * Fine couche de mise en forme HTTP au-dessus de `runHotelSearch`.
 */
export async function executeHotelSearch(
  q: HotelSearchQuery,
): Promise<NextResponse> {
  const result = await runHotelSearch(q)

  if (!result.ok) {
    const headers: Record<string, string> = {}
    if (result.retryAfterSeconds != null) {
      headers["Retry-After"] = String(result.retryAfterSeconds)
    }
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: result.status, headers },
    )
  }

  if (result.degraded) {
    return NextResponse.json(result.dto, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Degraded-Mode": "1",
        "X-Degraded-Reason": result.degradedReason ?? "",
      },
    })
  }

  const headers: Record<string, string> = result.isDemoMode
    ? { "x-demo-mode": "1" }
    : { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" }
  if (result.fromStaleCache) headers["X-From-Cache"] = "1"
  return NextResponse.json(result.dto, { status: 200, headers })
}

function demoSearchResult(cityId: number): HotelSearchRunResult {
  const parsed = HotelSearchResponse.safeParse(hotelSearchFixture)
  if (!parsed.success || !parsed.data.HotelSearch) {
    const empty: HotelSearchResultDTO = { count: 0, offers: [] }
    return { ok: true, dto: empty, degraded: false, fromStaleCache: false }
  }
  const rawOffers = parsed.data.HotelSearch.filter(
    (h) => h.Hotel?.City?.Id === cityId,
  )
    .filter(isRealHotelOffer)
    .map(mapHotelOffer)
  const offers = dedupeOffersByHotelId(rawOffers)
  const dto: HotelSearchResultDTO = {
    searchId: "demo-fixture",
    count: offers.length,
    offers,
  }
  return {
    ok: true,
    dto,
    degraded: false,
    fromStaleCache: false,
    isDemoMode: true,
  }
}

function mapErrorToRunResult(err: unknown): HotelSearchRunResult {
  if (err instanceof MyGoAuthError) {
    return {
      ok: false,
      status: 502,
      error: "auth_failed",
      message: "myGo credentials invalid",
    }
  }
  if (err instanceof MyGoError) {
    return { ok: false, status: 502, error: err.kind, message: err.message }
  }
  return {
    ok: false,
    status: 500,
    error: "internal",
    message: err instanceof Error ? err.message : "unknown",
  }
}

