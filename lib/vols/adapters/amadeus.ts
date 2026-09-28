/**
 * Amadeus GDS Adapter — stub.
 * Returns NOT_CONFIGURED until AMADEUS_CLIENT_ID + AMADEUS_CLIENT_SECRET
 * are set in the environment. Implements GdsAdapter; no Amadeus types leak
 * outside this file.
 */

import type { GdsAdapter, RecheckResult, BookResult, IssueResult } from "./types"
import type {
  CanonicalSearchRequest,
  CanonicalSearchResult,
  CanonicalItinerary,
} from "../canonical"

function isConfigured(): boolean {
  return !!(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET)
}

export function createAmadeusAdapter(): GdsAdapter {
  return {
    name: "amadeus",
    getConfigStatus: () => (isConfigured() ? "CONFIGURED" : "NOT_CONFIGURED"),

    async search(_request: CanonicalSearchRequest): Promise<CanonicalSearchResult> {
      throw new Error("Amadeus adapter: not yet implemented — add real search logic here.")
    },

    async recheck(_itinerary: CanonicalItinerary): Promise<RecheckResult> {
      throw new Error("Amadeus adapter: recheck not yet implemented.")
    },

    async book(
      _itinerary: CanonicalItinerary,
      _passengers: unknown[],
      _contact: unknown,
    ): Promise<BookResult> {
      throw new Error("Amadeus adapter: book not yet implemented.")
    },

    async issue(_pnr: string, _itinerary: CanonicalItinerary): Promise<IssueResult> {
      throw new Error("Amadeus adapter: issue not yet implemented.")
    },

    async cancel(_pnr: string, _itinerary: CanonicalItinerary): Promise<void> {
      throw new Error("Amadeus adapter: cancel not yet implemented.")
    },
  }
}
