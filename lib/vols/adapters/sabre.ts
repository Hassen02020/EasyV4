/**
 * Sabre GDS Adapter — stub.
 * Returns NOT_CONFIGURED until SABRE_CLIENT_ID + SABRE_CLIENT_SECRET +
 * SABRE_PCC are set. Supports Sabre REST (Bargain Finder Max / NDC).
 */

import type { GdsAdapter, RecheckResult, BookResult, IssueResult } from "./types"
import type {
  CanonicalSearchRequest,
  CanonicalSearchResult,
  CanonicalItinerary,
} from "../canonical"

function isConfigured(): boolean {
  return !!(
    process.env.SABRE_CLIENT_ID &&
    process.env.SABRE_CLIENT_SECRET &&
    process.env.SABRE_PCC
  )
}

export function createSabreAdapter(): GdsAdapter {
  return {
    name: "sabre",
    getConfigStatus: () => (isConfigured() ? "CONFIGURED" : "NOT_CONFIGURED"),

    async search(_request: CanonicalSearchRequest): Promise<CanonicalSearchResult> {
      throw new Error("Sabre adapter: not yet implemented.")
    },

    async recheck(_itinerary: CanonicalItinerary): Promise<RecheckResult> {
      throw new Error("Sabre adapter: recheck not yet implemented.")
    },

    async book(
      _itinerary: CanonicalItinerary,
      _passengers: unknown[],
      _contact: unknown,
    ): Promise<BookResult> {
      throw new Error("Sabre adapter: book not yet implemented.")
    },

    async issue(_pnr: string, _itinerary: CanonicalItinerary): Promise<IssueResult> {
      throw new Error("Sabre adapter: issue not yet implemented.")
    },

    async cancel(_pnr: string, _itinerary: CanonicalItinerary): Promise<void> {
      throw new Error("Sabre adapter: cancel not yet implemented.")
    },
  }
}
