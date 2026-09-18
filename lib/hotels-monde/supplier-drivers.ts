/**
 * Fondation multi-fournisseurs — Hôtels Monde (chantier 7, Phase Premium
 * 2). Portée volontairement minimale (pas un Hub complet comme
 * `lib/hotel-suppliers/**` pour Hôtels Tunisie — pas de timeout-race, pas
 * de déduplication cross-fournisseur) : juste assez pour que
 * `searchWorldHotels()` appelle N drivers au lieu d'un `if/else` figé,
 * afin qu'un futur second fournisseur réel soit une extension (ajouter un
 * driver à la liste) plutôt qu'une réécriture.
 *
 * Aucun nouveau fournisseur n'est inventé ici : les deux drivers
 * ci-dessous enveloppent tels quels les deux chemins qui existaient déjà
 * dans `client.ts` (fournisseur virtuel déterministe, et l'appel API
 * réel — jamais atteint aujourd'hui faute de `WORLD_HOTELS_API_KEY`,
 * fournisseur exact non tranché commercialement, voir l'en-tête de
 * `client.ts`). `getConfigStatus()` reproduit exactement la logique
 * `isDemoMode` déjà en place — mutuellement exclusifs, donc AUCUN
 * changement de comportement observable aujourd'hui : toujours exactement
 * un seul driver CONFIGURED.
 */
import { destinationByValue } from "./search-state"
import { search as virtualSearch } from "@/lib/hotels-monde/virtual-supplier/engine"
import { memoize } from "@/lib/cache/redis"
import type { WorldHotelOffer, WorldHotelSearchInput, WorldHotelSearchResult } from "@/lib/hotels-monde/client"

export interface WorldHotelSupplierDriver {
  readonly name: string
  getConfigStatus(): "CONFIGURED" | "NOT_CONFIGURED"
  /** Rejette en cas d'échec — jamais un résultat vide silencieux (voir searchAcrossWorldHotelDrivers, qui isole chaque driver). */
  search(input: WorldHotelSearchInput): Promise<{ offers: WorldHotelOffer[]; searchId: string }>
}

function isDemoMode(): boolean {
  return !process.env.WORLD_HOTELS_API_KEY || process.env.WORLD_HOTELS_DEMO_MODE === "true"
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
 * Fournisseur API réel (Expedia Rapid / Booking.com Demand — décision
 * commerciale non tranchée, voir en-tête de client.ts) — jamais CONFIGURED
 * dans cet environnement (aucune credential). Comportement réseau/cache
 * inchangé (fetch avec timeout 12s, memoize 5min).
 */
export function createWorldHotelApiDriver(): WorldHotelSupplierDriver {
  return {
    name: "api",
    getConfigStatus: () => (isDemoMode() ? "NOT_CONFIGURED" : "CONFIGURED"),
    search: async (input) => {
      const cacheKey = `e2b:hotels-monde:${input.destination}-${input.checkIn}-${input.checkOut}-${input.adults}-${input.rooms}`
      return memoize(cacheKey, 300, async () => {
        const url = new URL(`${process.env.WORLD_HOTELS_API_BASE_URL}/shop/hotels`)
        url.searchParams.set("destination", input.destination)
        url.searchParams.set("checkin", input.checkIn)
        url.searchParams.set("checkout", input.checkOut)
        url.searchParams.set("adults", String(input.adults))
        url.searchParams.set("rooms", String(input.rooms))
        if (input.stars) url.searchParams.set("stars", String(input.stars))

        const res = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${process.env.WORLD_HOTELS_API_KEY}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(12_000),
        })

        if (!res.ok) {
          throw new Error(`World Hotels API ${res.status}: ${res.statusText}`)
        }

        const json = await res.json()
        const offers = (json.data ?? []).map((o: unknown, i: number) => ({
          id: `offer-${i}`,
          ...(o as Record<string, unknown>),
        })) as WorldHotelOffer[]

        return { offers, searchId: json.meta?.searchId ?? `s-${Date.now()}` }
      })
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
