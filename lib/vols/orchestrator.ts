/**
 * Flight Search Orchestrator — Easy2Book Flight Puzzle
 *
 * Selects configured adapters, runs them in parallel, isolates failures,
 * normalizes results, deduplicates, and returns canonical itineraries.
 * One adapter down ≠ full search down, as long as another responds.
 */

import type { GdsAdapter } from "./adapters/types"
import type {
  CanonicalSearchRequest,
  CanonicalSearchResult,
  CanonicalItinerary,
} from "./canonical"
import { createVirtualGdsAdapter } from "./adapters/virtual"
import { createAmadeusAdapter } from "./adapters/amadeus"
import { createTravelportAdapter } from "./adapters/travelport"
import { createSabreAdapter } from "./adapters/sabre"

export function getDefaultAdapters(): GdsAdapter[] {
  return [
    createVirtualGdsAdapter(),
    createAmadeusAdapter(),
    createTravelportAdapter(),
    createSabreAdapter(),
  ]
}

/**
 * Deduplicates itineraries across adapters by provider + providerOfferId.
 * A future version may deduplicate by route/time/price across different
 * providers; for now only exact same-provider duplicates are removed.
 */
function deduplicate(itineraries: CanonicalItinerary[]): CanonicalItinerary[] {
  const seen = new Set<string>()
  return itineraries.filter((it) => {
    const key = `${it.provider.provider}:${it.provider.providerOfferId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Run search across all configured adapters in parallel.
 * Returns merged + deduplicated itineraries.
 * If all adapters fail, returns an error result.
 */
export async function orchestrateSearch(
  request: CanonicalSearchRequest,
  adapters: GdsAdapter[] = getDefaultAdapters(),
): Promise<CanonicalSearchResult> {
  const configured = adapters.filter((a) => a.getConfigStatus() === "CONFIGURED")
  if (configured.length === 0) {
    return {
      ok: false,
      error: "Aucun fournisseur vols configuré.",
      code: "NO_SUPPLIER_CONFIGURED",
    }
  }

  const outcomes = await Promise.allSettled(
    configured.map((adapter) =>
      adapter.search(request).then((result) => ({ adapter: adapter.name, result })),
    ),
  )

  const itineraries: CanonicalItinerary[] = []
  let searchId: string | undefined
  let lastError: string | undefined
  let anySuccess = false

  for (const outcome of outcomes) {
    if (outcome.status === "fulfilled") {
      const { result } = outcome.value
      if (result.ok) {
        anySuccess = true
        itineraries.push(...result.itineraries)
        searchId ??= result.searchId
      } else {
        lastError = result.error
        console.warn(`[orchestrator] adapter failed:`, result.error)
      }
    } else {
      lastError = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      console.warn(`[orchestrator] adapter rejected:`, lastError)
    }
  }

  if (!anySuccess) {
    return {
      ok: false,
      error: lastError ?? "Erreur inconnue",
      code: "FLIGHTS_SEARCH_ERROR",
    }
  }

  return {
    ok: true,
    itineraries: deduplicate(itineraries),
    searchId: searchId ?? `s-${Date.now()}`,
  }
}
