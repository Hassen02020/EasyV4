/**
 * Fondation multi-fournisseurs — Vols (chantier 7, Phase Premium 2).
 * Même principe que lib/hotels-monde/supplier-drivers.ts (voir ce fichier
 * pour la justification complète) : portée volontairement minimale, pas
 * de timeout-race ni de déduplication cross-fournisseur — juste assez
 * pour que `searchFlights()` appelle N drivers au lieu d'un `if/else`
 * figé. Les deux drivers enveloppent tels quels les deux chemins qui
 * existaient déjà dans `client.ts` — aucun fournisseur inventé.
 * `getConfigStatus()` reproduit exactement `isDemoMode` — mutuellement
 * exclusifs, donc aucun changement de comportement observable aujourd'hui.
 */
import { search as virtualSearch } from "@/lib/vols/virtual-supplier/engine"
import type { VirtualFlightSegment } from "@/lib/vols/virtual-supplier/catalog"
import { memoize } from "@/lib/cache/redis"
import type { FlightOffer, FlightSearchInput, FlightSearchResult } from "@/lib/vols/client"
import type { z } from "zod"
import { FlightJourneySchema } from "@/lib/vols/client"

type FlightJourney = z.infer<typeof FlightJourneySchema>

function buildJourneyFromLegacySegs(
  segs: VirtualFlightSegment[],
  departureDate: string,
): FlightJourney {
  const segments = segs.map((seg) => {
    const carrier = seg.carrier.slice(0, 2).toUpperCase()
    const flightNum = seg.flightNumber.replace(/^[A-Z]{2}/, "")
    return {
      origin: seg.origin,
      destination: seg.destination,
      departure: seg.departureAt,
      arrival: seg.arrivalAt,
      marketingCarrier: carrier,
      operatingCarrier: carrier,
      marketingFlightNumber: flightNum,
      durationMinutes: seg.durationMinutes,
      stops: 0,
      cabin: seg.cabin,
    }
  })

  const layovers = segments.slice(0, -1).map((seg, i) => {
    const nextSeg = segments[i + 1]!
    const arrivalMs = new Date(seg.arrival).getTime()
    const depMs = new Date(nextSeg.departure).getTime()
    const durationMinutes = Math.max(0, Math.round((depMs - arrivalMs) / 60000))
    return {
      airport: seg.destination,
      durationMinutes,
      isOvernightLayover: durationMinutes > 600,
    }
  })

  return {
    origin: segments[0]?.origin ?? "",
    destination: segments[segments.length - 1]?.destination ?? "",
    departureDate,
    segments,
    layovers,
  }
}

export interface FlightSupplierDriver {
  readonly name: string
  getConfigStatus(): "CONFIGURED" | "NOT_CONFIGURED"
  /** Rejette en cas d'échec — jamais un résultat vide silencieux (voir searchAcrossFlightDrivers, qui isole chaque driver). */
  search(input: FlightSearchInput): Promise<{ offers: FlightOffer[]; searchId: string }>
}

function isDemoMode(): boolean {
  return !process.env.FLIGHTS_API_KEY || process.env.FLIGHTS_DEMO_MODE === "true"
}

/** Fournisseur virtuel déterministe (voir virtual-supplier/engine.ts) — inchangé, juste enveloppé dans le contrat driver. */
export function createVirtualFlightDriver(): FlightSupplierDriver {
  return {
    name: "virtual",
    getConfigStatus: () => (isDemoMode() ? "CONFIGURED" : "NOT_CONFIGURED"),
    search: async (input) => {
      const { searchId, offers } = virtualSearch({
        origin: input.originCode,
        destination: input.destinationCode,
        departureDate: input.departureDate,
        returnDate: input.returnDate,
        adults: input.adults,
        children: input.children ?? 0,
        cabin: input.cabin ?? "ECONOMY",
      })

      const mapped: FlightOffer[] = offers.map((offer) => ({
        id: offer.offerId,
        journeys: [buildJourneyFromLegacySegs(offer.segments, input.departureDate)],
        stops: offer.stops,
        totalDurationMinutes: offer.totalDurationMinutes,
        priceTnd: offer.priceTnd,
        currency: offer.currency,
        availableSeats: offer.availableSeats,
        refundable: offer.refundable,
        baggageKg: offer.baggageKg,
        source: "virtual",
      }))

      return { offers: mapped, searchId }
    },
  }
}

/**
 * Fournisseur API réel (Amadeus / Sabre / NDC) — jamais CONFIGURED dans cet
 * environnement (aucune credential). Comportement réseau/cache inchangé
 * (fetch avec timeout 12s, memoize 5min).
 */
export function createFlightApiDriver(): FlightSupplierDriver {
  return {
    name: "api",
    getConfigStatus: () => (isDemoMode() ? "NOT_CONFIGURED" : "CONFIGURED"),
    search: async (input) => {
      const cacheKey = `e2b:vols:${input.originCode}-${input.destinationCode}-${input.departureDate}-${input.adults}`
      return memoize(cacheKey, 300, async () => {
        const url = new URL(`${process.env.FLIGHTS_API_BASE_URL}/shopping/flight-offers`)
        url.searchParams.set("originLocationCode", input.originCode)
        url.searchParams.set("destinationLocationCode", input.destinationCode)
        url.searchParams.set("departureDate", input.departureDate)
        url.searchParams.set("adults", String(input.adults))
        if (input.children) url.searchParams.set("children", String(input.children))
        if (input.cabin) url.searchParams.set("travelClass", input.cabin)

        const res = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${process.env.FLIGHTS_API_KEY}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(12_000),
        })

        if (!res.ok) {
          throw new Error(`Flights API ${res.status}: ${res.statusText}`)
        }

        const json = await res.json()
        const offers = (json.data ?? []).map((o: unknown, i: number) => ({
          id: `offer-${i}`,
          ...(o as Record<string, unknown>),
        })) as FlightOffer[]

        return { offers, searchId: json.meta?.searchId ?? `s-${Date.now()}` }
      })
    },
  }
}

/**
 * Exécute tous les drivers CONFIGURED en parallèle, isole chaque échec
 * individuel, fusionne les offres. Aujourd'hui, exactement un seul driver
 * est toujours CONFIGURED (voir isDemoMode ci-dessus) — résultat
 * identique bit à bit au comportement historique. Voir le commentaire
 * équivalent dans lib/hotels-monde/supplier-drivers.ts pour la portée
 * (pas de déduplication cross-fournisseur ici).
 */
export async function searchAcrossFlightDrivers(
  drivers: FlightSupplierDriver[],
  input: FlightSearchInput,
): Promise<FlightSearchResult> {
  const configured = drivers.filter((d) => d.getConfigStatus() === "CONFIGURED")
  if (configured.length === 0) {
    return { ok: false, error: "Aucun fournisseur vols configuré.", code: "NO_SUPPLIER_CONFIGURED" }
  }

  const outcomes = await Promise.allSettled(configured.map((d) => d.search(input)))

  const offers: FlightOffer[] = []
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
      code: "FLIGHTS_API_ERROR",
    }
  }

  return { ok: true, offers, searchId: searchId ?? `s-${Date.now()}` }
}
