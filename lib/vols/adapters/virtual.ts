/**
 * Virtual GDS Adapter — wraps lib/vols/virtual-supplier/ for the canonical
 * adapter interface. Active in demo mode (no real GDS credentials).
 * Produces deterministic offers seeded from route + date.
 * Builds proper Journey/Layover structures for the canonical model.
 */

import type { GdsAdapter, RecheckResult, BookResult, IssueResult } from "./types"
import type {
  CanonicalSearchRequest,
  CanonicalSearchResult,
  CanonicalItinerary,
  CanonicalSegment,
  Journey,
  Ancillary,
} from "../canonical"
import { computeLayovers } from "../canonical"
import { search as virtualSearch } from "@/lib/vols/virtual-supplier/engine"
import { book as virtualBook } from "@/lib/vols/virtual-supplier/engine"
import { cancel as virtualCancel } from "@/lib/vols/virtual-supplier/engine"
import { newSearchId } from "@/lib/vols/virtual-supplier/tokens"
import type { Cabin } from "@/lib/vols/virtual-supplier/catalog"

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

function buildSegments(
  rawSegs: Array<{
    origin: string
    destination: string
    departureAt: string
    arrivalAt: string
    carrier: string
    flightNumber: string
    durationMinutes: number
    cabin: string
  }>,
  cabinClass: CanonicalSegment["cabin"],
): CanonicalSegment[] {
  return rawSegs.map((seg): CanonicalSegment => ({
    origin: seg.origin,
    destination: seg.destination,
    departure: seg.departureAt,
    arrival: seg.arrivalAt,
    marketingCarrier: seg.carrier,
    operatingCarrier: seg.carrier,
    marketingFlightNumber: seg.flightNumber.replace(/^[A-Z]{2}/, ""),
    durationMinutes: seg.durationMinutes,
    stops: 0,
    cabin: cabinClass,
  }))
}

function buildJourney(segments: CanonicalSegment[]): Journey {
  return {
    origin: segments[0].origin,
    destination: segments[segments.length - 1].destination,
    departureDate: segments[0].departure.slice(0, 10),
    segments,
    layovers: computeLayovers(segments),
  }
}

/**
 * Returns a deterministic set of purchasable ancillaries for virtual offers.
 * Prices are fixed demo values; the authoritative amount lives here (server-side),
 * never in the browser.
 */
function buildVirtualAncillaries(offerId: string, includedBaggageKg: number): Ancillary[] {
  const seed = offerId.charCodeAt(0) % 3
  const ancillaries: Ancillary[] = []

  // Extra baggage (only when included allowance < 23 kg)
  if (includedBaggageKg < 23) {
    ancillaries.push({
      ancillaryId: `${offerId}-BAG23`,
      type: "BAGGAGE",
      description: "Bagage en soute 23 kg",
      amount: 35,
      currency: "TND",
    })
    ancillaries.push({
      ancillaryId: `${offerId}-BAG32`,
      type: "BAGGAGE",
      description: "Bagage en soute 32 kg",
      amount: 55,
      currency: "TND",
    })
  }

  // Seat selection (window seats at a premium)
  ancillaries.push({
    ancillaryId: `${offerId}-SEAT-WIN`,
    type: "SEAT",
    description: "Siège hublot",
    amount: 15,
    currency: "TND",
  })
  if (seed > 0) {
    ancillaries.push({
      ancillaryId: `${offerId}-SEAT-LEG`,
      type: "SEAT",
      description: "Siège avec espace jambes supplémentaire",
      amount: 25,
      currency: "TND",
    })
  }

  // Meal
  ancillaries.push({
    ancillaryId: `${offerId}-MEAL-VEG`,
    type: "MEAL",
    description: "Repas végétarien",
    amount: 12,
    currency: "TND",
  })

  // Priority boarding
  ancillaries.push({
    ancillaryId: `${offerId}-PRIO`,
    type: "PRIORITY",
    description: "Embarquement prioritaire",
    amount: 10,
    currency: "TND",
  })

  return ancillaries
}

export function createVirtualGdsAdapter(): GdsAdapter {
  return {
    name: "virtual",
    getConfigStatus: () => (isDemoMode() ? "CONFIGURED" : "NOT_CONFIGURED"),

    async search(request: CanonicalSearchRequest): Promise<CanonicalSearchResult> {
      const cabinClass = request.cabin as Cabin

      // ── Outbound leg ────────────────────────────────────────────────────────
      const { searchId, offers: outboundOffers } = virtualSearch({
        origin: request.origin,
        destination: request.destination,
        departureDate: request.departureDate,
        returnDate: request.returnDate,
        adults: request.adults,
        children: request.children,
        cabin: cabinClass,
      })

      // ── Return leg (ROUND_TRIP only) ────────────────────────────────────────
      let returnOffers: typeof outboundOffers = []
      if (request.tripType === "ROUND_TRIP" && request.returnDate) {
        const { offers } = virtualSearch({
          origin: request.destination,
          destination: request.origin,
          departureDate: request.returnDate,
          adults: request.adults,
          children: request.children,
          cabin: cabinClass,
        })
        returnOffers = offers
      }

      const itineraries: CanonicalItinerary[] = outboundOffers.map((offer, i) => {
        const outboundSegments = buildSegments(offer.segments, cabinClass)
        const outboundJourney = buildJourney(outboundSegments)

        const journeys: Journey[] = [outboundJourney]

        // Pair with a return offer (round-robin if lengths differ)
        if (request.tripType === "ROUND_TRIP" && returnOffers.length > 0) {
          const returnOffer = returnOffers[i % returnOffers.length]!
          const returnSegments = buildSegments(returnOffer.segments, cabinClass)
          journeys.push(buildJourney(returnSegments))
        }

        const totalPriceTnd =
          request.tripType === "ROUND_TRIP" && returnOffers.length > 0
            ? offer.priceTnd + (returnOffers[i % returnOffers.length]?.priceTnd ?? 0)
            : offer.priceTnd

        return {
          tripType: request.tripType,
          journeys,
          fares: [
            {
              currency: "TND",
              baseAmount: Math.round(totalPriceTnd * 0.85),
              taxAmount: Math.round(totalPriceTnd * 0.15),
              totalAmount: Math.round(totalPriceTnd / (request.adults + Math.max(request.children, 1))),
              passengerType: "ADT",
              count: request.adults,
            },
            ...(request.children > 0
              ? [
                  {
                    currency: "TND",
                    baseAmount: Math.round(totalPriceTnd * 0.85 * 0.75),
                    taxAmount: Math.round(totalPriceTnd * 0.15 * 0.75),
                    totalAmount: Math.round(
                      (totalPriceTnd * 0.75) / (request.adults + request.children),
                    ),
                    passengerType: "CHD" as const,
                    count: request.children,
                  },
                ]
              : []),
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
          supplierTotalAmount: totalPriceTnd,
          supplierCurrency: "TND",
          availableSeats: offer.availableSeats,
          ancillaries: buildVirtualAncillaries(offer.offerId, offer.baggageKg ?? 0),
        }
      })

      return { ok: true, itineraries, searchId }
    },

    async recheck(itinerary: CanonicalItinerary): Promise<RecheckResult> {
      const token = itinerary.provider.pricingToken
      if (!token) return { status: "ERROR", error: "No pricing token" }

      const p = parsePricingToken(token)
      if (!p) return { status: "EXPIRED", error: "Token invalide" }

      const { offers } = virtualSearch({
        origin: p.origin,
        destination: p.destination,
        departureDate: p.departureDate,
        adults: p.adults,
        children: p.children,
        cabin: p.cabin as Cabin,
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
