/**
 * Virtual GDS Adapter — wraps lib/vols/virtual-supplier/ for the canonical
 * adapter interface. Active in demo mode (no real GDS credentials).
 * Produces deterministic offers seeded from route + date.
 */

import type { GdsAdapter, RecheckResult, BookResult, IssueResult } from "./types"
import type {
  CanonicalSearchRequest,
  CanonicalSearchResult,
  CanonicalItinerary,
  CanonicalSegment,
} from "../canonical"
import { search as virtualSearch } from "@/lib/vols/virtual-supplier/engine"
import { book as virtualBook } from "@/lib/vols/virtual-supplier/engine"
import { cancel as virtualCancel } from "@/lib/vols/virtual-supplier/engine"
import { minutesToIso } from "@/lib/vols/virtual-supplier/catalog"
import { newSearchId } from "@/lib/vols/virtual-supplier/tokens"

function isDemoMode(): boolean {
  return !process.env.FLIGHTS_API_KEY || process.env.FLIGHTS_DEMO_MODE === "true"
}

function parsePricingToken(token: string): {
  searchId: string
  offerId: string
  origin: string
  destination: string
  departureDate: string
  returnDate?: string
  adults: number
  children: number
  cabin: string
  priceTnd: number
} | null {
  try {
    const [, payload] = token.split(".")
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString())
    return decoded as ReturnType<typeof parsePricingToken>
  } catch {
    return null
  }
}

export function createVirtualGdsAdapter(): GdsAdapter {
  return {
    name: "virtual",
    getConfigStatus: () => (isDemoMode() ? "CONFIGURED" : "NOT_CONFIGURED"),

    async search(request: CanonicalSearchRequest): Promise<CanonicalSearchResult> {
      const { searchId, offers } = virtualSearch({
        origin: request.origin,
        destination: request.destination,
        departureDate: request.departureDate,
        returnDate: request.returnDate,
        adults: request.adults,
        children: request.children,
        cabin: request.cabin,
      })

      const itineraries: CanonicalItinerary[] = offers.map((offer) => ({
        tripType: request.tripType,
        segments: offer.segments.map((seg): CanonicalSegment => ({
          origin: seg.origin,
          destination: seg.destination,
          departure: seg.departureAt,
          arrival: seg.arrivalAt,
          airline: seg.carrier,
          flightNumber: seg.flightNumber,
          durationMinutes: seg.durationMinutes,
          stops: 0,
          cabin: request.cabin,
        })),
        fares: [
          {
            currency: "TND",
            baseAmount: Math.round(offer.priceTnd * 0.85),
            taxAmount: Math.round(offer.priceTnd * 0.15),
            totalAmount: Math.round(offer.priceTnd / (request.adults + request.children)),
            passengerType: "ADT",
            count: request.adults,
          },
          ...(request.children > 0 ? [{
            currency: "TND",
            baseAmount: Math.round(offer.priceTnd * 0.85 * 0.75),
            taxAmount: Math.round(offer.priceTnd * 0.15 * 0.75),
            totalAmount: Math.round(offer.priceTnd * 0.75 / (request.adults + request.children)),
            passengerType: "CHD" as const,
            count: request.children,
          }] : []),
        ],
        baggage: {
          cabin: true,
          checkedKg: offer.baggageKg ?? 0,
          checkedPieces: offer.baggageKg && offer.baggageKg > 0 ? 1 : 0,
        },
        fareRules: {
          refundable: offer.refundable,
          changeable: true,
          conditions: offer.refundable
            ? "Remboursable avec frais de dossier de 50 TND."
            : "Non remboursable.",
        },
        provider: {
          provider: "virtual",
          providerOfferId: offer.offerId,
          pricingToken: offer.token,
        },
        supplierTotalAmount: offer.priceTnd,
        supplierCurrency: "TND",
        availableSeats: offer.availableSeats,
      }))

      return { ok: true, itineraries, searchId }
    },

    async recheck(itinerary: CanonicalItinerary): Promise<RecheckResult> {
      const token = itinerary.provider.pricingToken
      if (!token) return { status: "ERROR", error: "No pricing token" }

      const p = parsePricingToken(token)
      if (!p) return { status: "EXPIRED", error: "Token invalide" }

      // Re-run virtual search to compare price
      const { offers } = virtualSearch({
        origin: p.origin,
        destination: p.destination,
        departureDate: p.departureDate,
        adults: p.adults,
        children: p.children,
        cabin: p.cabin as "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST",
      })
      const match = offers.find((o) => o.offerId === p.offerId)
      if (!match || match.availableSeats === 0) {
        return { status: "UNAVAILABLE" }
      }

      if (match.priceTnd !== p.priceTnd) {
        return {
          status: "PRICE_CHANGED",
          currentSupplierAmount: match.priceTnd,
          currentSupplierCurrency: "TND",
        }
      }

      return {
        status: "AVAILABLE",
        currentSupplierAmount: match.priceTnd,
        currentSupplierCurrency: "TND",
        itinerary,
      }
    },

    async book(
      itinerary: CanonicalItinerary,
      _passengers: unknown[],
      _contact: unknown,
    ): Promise<BookResult> {
      const token = itinerary.provider.pricingToken
      if (!token) throw new Error("No pricing token for booking")

      const p = parsePricingToken(token)
      if (!p) throw new Error("Invalid pricing token")

      const result = await virtualBook(token, p.priceTnd)

      if (!result.ok) throw new Error(result.message)

      return {
        pnr: result.pnr,
        supplierBookingReference: `VIRT-${result.pnr}`,
      }
    },

    async issue(pnr: string, _itinerary: CanonicalItinerary): Promise<IssueResult> {
      // Virtual supplier: ticket = PNR-based reference
      return {
        tickets: [
          {
            passengerRef: "ALL",
            ticketNumber: `220${pnr}`,
            eticketUrl: undefined,
          },
        ],
      }
    },

    async cancel(_pnr: string, itinerary: CanonicalItinerary): Promise<void> {
      const token = itinerary.provider.pricingToken
      if (!token) return
      const p = parsePricingToken(token)
      if (!p) return
      await virtualCancel({
        offerId: p.offerId,
        departureDate: p.departureDate,
        adults: p.adults,
        children: p.children,
      })
    },
  }
}
