/**
 * Fondation multi-fournisseurs — Hôtels Monde (chantier 7, Phase Premium
 * 2). Portée volontairement minimale (pas un Hub complet comme
 * `lib/hotel-suppliers/**` pour Hôtels Tunisie — pas de timeout-race, pas
 * de déduplication cross-fournisseur) : juste assez pour que
 * `searchWorldHotels()` appelle N drivers au lieu d'un `if/else` figé,
 * afin qu'un futur second fournisseur réel soit une extension (ajouter un
 * driver à la liste) plutôt qu'une réécriture.
 *
 * Fournisseur virtuel déterministe (démo) + fournisseur réel RateHawk
 * (décision fournisseur validée — voir en-tête de `createRateHawkDriver`
 * ci-dessous) — jamais CONFIGURED dans cet environnement faute de
 * `RATEHAWK_KEY_ID`/`RATEHAWK_API_KEY` réels. `getConfigStatus()` garde
 * exactement la logique `isDemoMode` déjà en place — mutuellement
 * exclusifs, donc AUCUN changement de comportement observable aujourd'hui :
 * toujours exactement un seul driver CONFIGURED (le virtuel).
 */
import { destinationByValue } from "./search-state"
import { search as virtualSearch } from "@/lib/hotels-monde/virtual-supplier/engine"
import { memoize } from "@/lib/cache/redis"
import { CURRENCY_META } from "@/lib/currency"
import type { WorldHotelOffer, WorldHotelSearchInput, WorldHotelSearchResult } from "@/lib/hotels-monde/client"

export interface WorldHotelSupplierDriver {
  readonly name: string
  getConfigStatus(): "CONFIGURED" | "NOT_CONFIGURED"
  /** Rejette en cas d'échec — jamais un résultat vide silencieux (voir searchAcrossWorldHotelDrivers, qui isole chaque driver). */
  search(input: WorldHotelSearchInput): Promise<{ offers: WorldHotelOffer[]; searchId: string }>
}

function isDemoMode(): boolean {
  return !process.env.RATEHAWK_KEY_ID || !process.env.RATEHAWK_API_KEY || process.env.WORLD_HOTELS_DEMO_MODE === "true"
}

/** Fournisseur virtuel déterministe (voir virtual-supplier/engine.ts) — inchangé, juste enveloppé dans le contrat driver. */
export function createVirtualWorldHotelDriver(): WorldHotelSupplierDriver {
  return {
    name: "virtual",
    getConfigStatus: () => (isDemoMode() ? "CONFIGURED" : "NOT_CONFIGURED"),
    search: async (input) => {
      const destination = destinationByValue(input.destination)
      const city = destination?.city ?? input.destination
      const country = destination?.country ?? "—"

      const { searchId, offers } = virtualSearch({
        destination: input.destination,
        city,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights: input.nights,
        adults: input.adults,
        rooms: input.rooms,
        stars: input.stars,
      })

      const mapped: WorldHotelOffer[] = offers.map((offer) => ({
        id: offer.offerId,
        name: offer.name,
        city,
        country,
        stars: offer.stars,
        rating: offer.rating,
        reviewCount: offer.reviewCount,
        thumbnailUrl: null,
        pricePerNightTnd: offer.pricePerNightTnd,
        totalPriceTnd: offer.totalPriceTnd,
        nights: offer.nights,
        currency: offer.currency,
        refundable: offer.refundable,
        breakfastIncluded: offer.breakfastIncluded,
        distanceFromCenterKm: offer.distanceFromCenterKm,
        source: "virtual",
        offerToken: offer.token,
      }))

      return { offers: mapped, searchId }
    },
  }
}

/**
 * Fournisseur réel — RateHawk (Emerging Travel Group, pAPI v3), décision
 * fournisseur validée : onboarding self-service sans IATA, net rate, voir
 * l'analyse fournisseurs Hôtels Monde de ce chantier. Jamais CONFIGURED
 * dans cet environnement (aucune credential partenaire).
 *
 * Endpoints/auth confirmés par la documentation publique ETG
 * (docs.emergingtravel.com — accès complet aux schémas exacts réservé aux
 * comptes partenaires, non consultable depuis ici) :
 *  - Base URL   : https://api.worldota.net/api/b2b/v3 (prod) —
 *                 https://api-sandbox.ratehawk.com/api/b2b/v3 (sandbox)
 *  - Auth       : HTTP Basic, KEY_ID:API_KEY (RATEHAWK_KEY_ID / RATEHAWK_API_KEY)
 *  - Résolution destination → region_id : POST /search/multicomplete/
 *    (nos POPULAR_DESTINATIONS n'ont pas de region_id RateHawk statique —
 *    résolu dynamiquement à chaque recherche plutôt que via une table à
 *    maintenir à la main, et mis en cache 24h)
 *  - Recherche  : POST /search/serp/region/ (SERP — renvoie prix/book_hash
 *    par hôtel, PAS le contenu statique : nom/étoiles/photo viennent d'un
 *    appel séparé au Content API, non branché ici — voir resolveHotelStaticInfo)
 *
 * IMPORTANT : `resolveHotelStaticInfo()` ci-dessous est un TODO volontaire
 * — tant qu'il n'est pas branché sur le Content API RateHawk (dump statique
 * hôtels, accessible uniquement avec des credentials partenaire réels que
 * nous n'avons pas encore), il retourne `null` et `search()` ignore les
 * offres sans nom résolu plutôt que d'inventer un nom d'hôtel. Ce driver
 * restera donc silencieux (zéro offre) même une fois CONFIGURED, tant que
 * cette étape n'est pas complétée avec un vrai compte sandbox.
 */

function rateHawkAuthHeader(): string {
  const basic = Buffer.from(`${process.env.RATEHAWK_KEY_ID}:${process.env.RATEHAWK_API_KEY}`).toString("base64")
  return `Basic ${basic}`
}

/**
 * Sandbox par défaut ("RateHawk Sandbox → connexion → recherche réelle →
 * affichage des hôtels" — étape actuelle du chantier). Passer
 * RATEHAWK_API_BASE_URL=https://api.worldota.net/api/b2b/v3 (ou
 * RATEHAWK_ENV=production) le jour où le passage en production est validé —
 * jamais l'inverse par défaut, pour ne pas risquer un appel prod accidentel
 * pendant la phase de certification sandbox.
 */
function rateHawkBaseUrl(): string {
  if (process.env.RATEHAWK_API_BASE_URL) return process.env.RATEHAWK_API_BASE_URL
  return process.env.RATEHAWK_ENV === "production"
    ? "https://api.worldota.net/api/b2b/v3"
    : "https://api-sandbox.ratehawk.com/api/b2b/v3"
}

/** Répartit les adultes sur les chambres le plus uniformément possible — WorldHotelSearchInput n'a pas encore d'occupation par chambre/enfants. */
function buildRateHawkGuests(adults: number, rooms: number): Array<{ adults: number; children: number[] }> {
  const perRoom = Math.max(1, Math.floor(adults / Math.max(1, rooms)))
  const remainder = adults - perRoom * rooms
  return Array.from({ length: Math.max(1, rooms) }, (_, i) => ({
    adults: perRoom + (i < remainder ? 1 : 0),
    children: [],
  }))
}

async function resolveRateHawkRegionId(cityQuery: string): Promise<number | null> {
  return memoize(`e2b:ratehawk:region:${cityQuery.toLowerCase()}`, 86_400, async () => {
    const res = await fetch(`${rateHawkBaseUrl()}/search/multicomplete/`, {
      method: "POST",
      headers: { Authorization: rateHawkAuthHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ query: cityQuery, language: "en" }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`RateHawk multicomplete ${res.status}: ${res.statusText}`)
    const json = await res.json()
    const regions = (json?.data?.regions ?? []) as Array<{ id: number }>
    return regions[0]?.id ?? null
  })
}

/**
 * Convertit un montant RateHawk (toujours demandé en USD, voir search()
 * ci-dessous) vers TND — pricePerNightTnd/totalPriceTnd doivent être en TND
 * comme leur nom l'indique, exactement comme le driver virtuel les produit
 * déjà (lib/currency.ts : 1 TND = CURRENCY_META.USD.rateFromTND USD).
 * Passthrough si RateHawk renvoyait un jour directement du TND.
 */
export function convertRateHawkAmountToTnd(amount: number, currency: string): number {
  return currency === "USD" ? amount / CURRENCY_META.USD.rateFromTND : amount
}

/**
 * TODO (voir en-tête du driver) : brancher le Content API RateHawk (dump
 * statique hôtels) pour résoudre nom/étoiles/photo par id d'hôtel. Retourne
 * délibérément `null` tant que ce n'est pas fait — jamais un nom inventé.
 */
async function resolveHotelStaticInfo(
  _hotelId: string,
): Promise<{ name: string; stars: number | null; thumbnailUrl: string | null } | null> {
  return null
}

export function createRateHawkDriver(): WorldHotelSupplierDriver {
  return {
    name: "ratehawk",
    getConfigStatus: () => (isDemoMode() ? "NOT_CONFIGURED" : "CONFIGURED"),
    search: async (input) => {
      const destination = destinationByValue(input.destination)
      const city = destination?.city ?? input.destination
      const country = destination?.country ?? "—"
      // Diacritiques retirés (ex. "Dubaï" -> "Dubai") : la recherche
      // RateHawk multicomplete attend une saisie type utilisateur, mieux
      // vaut la forme ASCII la plus courante que le libellé FR accentué.
      const asciiCity = city.normalize("NFD").replace(/[̀-ͯ]/g, "")

      const regionId = await resolveRateHawkRegionId(asciiCity)
      if (regionId == null) {
        throw new Error(`RateHawk: aucune région trouvée pour "${city}"`)
      }

      const cacheKey = `e2b:ratehawk:serp:${regionId}-${input.checkIn}-${input.checkOut}-${input.adults}-${input.rooms}`
      const searchId = `rh-${regionId}-${Date.now()}`

      const rawHotels = await memoize(cacheKey, 300, async () => {
        const res = await fetch(`${rateHawkBaseUrl()}/search/serp/region/`, {
          method: "POST",
          headers: { Authorization: rateHawkAuthHeader(), "Content-Type": "application/json" },
          body: JSON.stringify({
            region_id: regionId,
            checkin: input.checkIn,
            checkout: input.checkOut,
            currency: "USD",
            residency: "tn",
            guests: buildRateHawkGuests(input.adults, input.rooms),
          }),
          signal: AbortSignal.timeout(12_000),
        })
        if (!res.ok) {
          throw new Error(`RateHawk search/serp/region ${res.status}: ${res.statusText}`)
        }
        const json = await res.json()
        return (json?.data?.hotels ?? []) as Array<{
          id: string
          rates?: Array<{
            daily_prices?: string[]
            payment_options?: { payment_types?: Array<{ amount?: string; currency_code?: string; type?: string }> }
          }>
        }>
      })

      const offers: WorldHotelOffer[] = []
      for (const hotel of rawHotels) {
        const cheapestRate = (hotel.rates ?? [])
          .map((rate) => {
            const paymentType = rate.payment_options?.payment_types?.[0]
            const totalPrice = paymentType?.amount ? parseFloat(paymentType.amount) : NaN
            return { rate, totalPrice, currency: paymentType?.currency_code ?? "USD", refundable: paymentType?.type !== "deposit" }
          })
          .filter((r) => Number.isFinite(r.totalPrice))
          .sort((a, b) => a.totalPrice - b.totalPrice)[0]
        if (!cheapestRate) continue

        // Jamais de nom inventé : sans contenu statique résolu, l'offre est
        // ignorée plutôt qu'affichée avec un nom fabriqué.
        const staticInfo = await resolveHotelStaticInfo(hotel.id)
        if (!staticInfo) continue

        const totalPriceTnd = convertRateHawkAmountToTnd(cheapestRate.totalPrice, cheapestRate.currency)

        offers.push({
          id: hotel.id,
          name: staticInfo.name,
          city,
          country,
          stars: staticInfo.stars,
          rating: null,
          reviewCount: null,
          thumbnailUrl: staticInfo.thumbnailUrl,
          pricePerNightTnd: Math.round((totalPriceTnd / Math.max(1, input.nights)) * 100) / 100,
          totalPriceTnd: Math.round(totalPriceTnd * 100) / 100,
          nights: input.nights,
          currency: "TND",
          refundable: cheapestRate.refundable,
          breakfastIncluded: false,
          distanceFromCenterKm: null,
          source: "ratehawk",
        })
      }

      return { offers, searchId }
    },
  }
}

/**
 * Exécute tous les drivers CONFIGURED en parallèle, isole chaque échec
 * individuel (un driver qui rejette ne fait jamais échouer les autres),
 * fusionne les offres. Aujourd'hui, exactement un seul driver est
 * toujours CONFIGURED (voir isDemoMode ci-dessus) — le résultat est donc
 * identique bit à bit au comportement historique. Le jour où un second
 * driver devient CONFIGURED, la fusion fonctionne déjà (concaténation
 * simple ; pas de déduplication cross-fournisseur ici — hors périmètre de
 * cette fondation minimale, voir docs/audits/multi-supplier-hub-audit.md).
 */
export async function searchAcrossWorldHotelDrivers(
  drivers: WorldHotelSupplierDriver[],
  input: WorldHotelSearchInput,
): Promise<WorldHotelSearchResult> {
  const configured = drivers.filter((d) => d.getConfigStatus() === "CONFIGURED")
  if (configured.length === 0) {
    return { ok: false, error: "Aucun fournisseur hôtels monde configuré.", code: "NO_SUPPLIER_CONFIGURED" }
  }

  const outcomes = await Promise.allSettled(configured.map((d) => d.search(input)))

  const offers: WorldHotelOffer[] = []
  let searchId: string | undefined
  let lastError: unknown
  let anySuccess = false

  for (const outcome of outcomes) {
    if (outcome.status === "fulfilled") {
      anySuccess = true
      offers.push(...outcome.value.offers)
      searchId ??= outcome.value.searchId
    } else {
      lastError = outcome.reason
    }
  }

  if (!anySuccess) {
    return {
      ok: false,
      error: lastError instanceof Error ? lastError.message : "Erreur inconnue",
      code: "WORLD_HOTELS_API_ERROR",
    }
  }

  return { ok: true, offers, searchId: searchId ?? `s-${Date.now()}` }
}
