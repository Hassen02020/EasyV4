/**
 * Travelport GDS Adapter — stub.
 * Returns NOT_CONFIGURED until TRAVELPORT_USERNAME + TRAVELPORT_PASSWORD +
 * TRAVELPORT_PCC are set. Supports Travelport Universal API (JSON).
 */

import type { GdsAdapter, RecheckResult, BookResult, IssueResult } from "./types"
import type {
  CanonicalSearchRequest,
  CanonicalSearchResult,
  CanonicalItinerary,
} from "../canonical"

function isConfigured(): boolean {
  return !!(
    process.env.TRAVELPORT_USERNAME &&
    process.env.TRAVELPORT_PASSWORD &&
    process.env.TRAVELPORT_PCC
  )
}

export function createTravelportAdapter(): GdsAdapter {
  return {
    name: "travelport",
    getConfigStatus: () => (isConfigured() ? "CONFIGURED" : "NOT_CONFIGURED"),

    async search(_request: CanonicalSearchRequest): Promise<CanonicalSearchResult> {
      throw new Error("Travelport adapter: not yet implemented.")
    },

    async recheck(_itinerary: CanonicalItinerary): Promise<RecheckResult> {
      throw new Error("Travelport adapter: recheck not yet implemented.")
    },

    async book(
      _itinerary: CanonicalItinerary,
      _passengers: unknown[],
      _contact: unknown,
    ): Promise<BookResult> {
      throw new Error("Travelport adapter: book not yet implemented.")
    },

    async issue(_pnr: string, _itinerary: CanonicalItinerary): Promise<IssueResult> {
      throw new Error("Travelport adapter: issue not yet implemented.")
    },

    async cancel(_pnr: string, _itinerary: CanonicalItinerary): Promise<void> {
      throw new Error("Travelport adapter: cancel not yet implemented.")
    },
  }
}
