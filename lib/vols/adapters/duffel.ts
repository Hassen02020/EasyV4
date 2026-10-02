/**
 * Duffel GDS Adapter — lib/vols/adapters/duffel.ts
 *
 * Implements GdsAdapter for the Duffel NDC aggregator (api.duffel.com v2).
 * Uses fetch directly — no @duffel/api SDK dependency.
 *
 * CONFIGURED when DUFFEL_ACCESS_TOKEN is set and FLIGHTS_DEMO_MODE ≠ "true".
 *
 * Key mapping decisions :
 *   provider.pricingToken = JSON { offerId, passengerIds }
 *     offerId      — Duffel offer ID ("off_..."), used for recheck and order creation
 *     passengerIds — Duffel passenger IDs from the OfferRequest, in sequence order
 *   BookResult.pnr                   = order.id ("ord_...") — used for issue/cancel
 *   BookResult.supplierBookingReference = order.booking_reference (6-char IATA locator)
 *
 * Currency discipline (CURRENCY-DIM-01a — superseded 2026-10-02) :
 *   Requests TND via currency param in OfferRequest.
 *   Duffel ignores the currency hint and returns EUR/USD in practice.
 *   Fix: convert EUR/USD → TND at search time using the real exchange-rate
 *   module (fetchExchangeRateForDisplay, display-grade cache). If the rate is
 *   unavailable (missing EXCHANGE_RATE_API_KEY or network error), the offer is
 *   skipped silently — never a fabricated conversion.
 *   The original Duffel currency + amount are preserved in pricingToken so
 *   book() pays Duffel in their required currency (EUR/USD), while the
 *   canonical itinerary exposes TND for the commercial engine.
 *
 * Payment: Duffel "balance" type (requires Duffel credit balance on account).
 */

import type {
  GdsAdapter,
  RecheckResult,
  BookResult,
  IssueResult,
} from "./types"
import type {
  CanonicalSearchRequest,
  CanonicalSearchResult,
  CanonicalItinerary,
  CanonicalSegment,
  Journey,
  CanonicalFare,
  CanonicalBaggage,
  CanonicalFareRules,
  CabinClass,
} from "../canonical"
import { computeLayovers } from "../canonical"
import {
  fetchExchangeRateForDisplay,
  fetchExchangeRateForBooking,
} from "@/lib/finance/exchange-rate"

// ---------------------------------------------------------------------------
// Duffel inline types (minimal — only fields we use)
// ---------------------------------------------------------------------------

interface DuffelBaggage {
  type: "checked" | "carry_on"
  quantity: number
}

interface DuffelSegmentPassenger {
  cabin_class: string
  cabin_class_marketing_name: string
  baggages: DuffelBaggage[]
}

interface DuffelSegment {
  id: string
  origin: { iata_code: string }
  destination: { iata_code: string }
  departing_at: string
  arriving_at: string
  duration: string
  marketing_carrier: { iata_code: string }
  operating_carrier: { iata_code: string }
  marketing_carrier_flight_number: string
  operating_carrier_flight_number?: string
  aircraft?: { iata_code: string }
  passengers: DuffelSegmentPassenger[]
  stops: Array<{ iata_code: string; duration: string }>
}

interface DuffelSlice {
  id: string
  origin: { iata_code: string }
  destination: { iata_code: string }
  segments: DuffelSegment[]
}

interface DuffelOfferPassenger {
  id: string
  type: "adult" | "child" | "infant_without_seat"
  age?: number
}

interface DuffelConditions {
  refund_before_departure?: {
    allowed: boolean
    penalty_amount?: string
    penalty_currency?: string
  }
  change_before_departure?: {
    allowed: boolean
    penalty_amount?: string
    penalty_currency?: string
  }
}

interface DuffelOffer {
  id: string
  total_amount: string
  total_currency: string
  base_amount: string
  tax_amount: string
  slices: DuffelSlice[]
  passengers: DuffelOfferPassenger[]
  conditions: DuffelConditions
  available_seats: number | null
  expires_at: string
}

interface DuffelOfferRequest {
  id: string
  offers: DuffelOffer[]
}

interface DuffelOrderDocument {
  type: "electronic_ticket" | "boarding_pass"
  passenger_id: string
  unique_identifier: string
  url?: string
}

interface DuffelOrder {
  id: string
  booking_reference: string
  documents: DuffelOrderDocument[]
}

interface DuffelPricingToken {
  offerId: string
  passengerIds: string[]
  originalAmount: number    // pre-conversion Duffel amount (e.g. EUR/USD)
  originalCurrency: string  // pre-conversion Duffel currency (e.g. "EUR", "USD")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DUFFEL_BASE_URL = "https://api.duffel.com"
const DUFFEL_VERSION = "v2"

function getToken(): string | undefined {
  return process.env.DUFFEL_ACCESS_TOKEN
}

function isDemoMode(): boolean {
  return !getToken() || process.env.FLIGHTS_DEMO_MODE === "true"
}

async function duffelFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  if (!token) throw new Error("DUFFEL_ACCESS_TOKEN manquant")

  const resp = await fetch(`${DUFFEL_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Duffel-Version": DUFFEL_VERSION,
      ...(options.headers ?? {}),
    },
  })

  if (!resp.ok) {
    let errMsg = `Duffel API ${resp.status} ${resp.statusText}`
    try {
      const body = (await resp.json()) as {
        errors?: Array<{ message: string }>
      }
      errMsg = body.errors?.[0]?.message ?? errMsg
    } catch {
      /* ignore parse error */
    }
    throw new Error(errMsg)
  }

  const body = (await resp.json()) as { data: T }
  return body.data
}

function parseIsoDuration(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(iso)
  return Number(m?.[1] ?? 0) * 60 + Number(m?.[2] ?? 0)
}

function toCabinClass(duffelCabin: string): CabinClass {
  const map: Record<string, CabinClass> = {
    economy: "ECONOMY",
    premium_economy: "PREMIUM_ECONOMY",
    business: "BUSINESS",
    first: "FIRST",
  }
  return map[duffelCabin.toLowerCase()] ?? "ECONOMY"
}

function fromCabinClass(cabin: CabinClass): string {
  const map: Record<CabinClass, string> = {
    ECONOMY: "economy",
    PREMIUM_ECONOMY: "premium_economy",
    BUSINESS: "business",
    FIRST: "first",
  }
  return map[cabin]
}

function parsePricingToken(
  token: string | undefined,
): DuffelPricingToken | null {
  if (!token) return null
  try {
    return JSON.parse(
      Buffer.from(token, "base64url").toString(),
    ) as DuffelPricingToken
  } catch {
    return null
  }
}

function encodePricingToken(data: DuffelPricingToken): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url")
}

// ---------------------------------------------------------------------------
// Duffel offer → CanonicalItinerary
// ---------------------------------------------------------------------------

function mapOfferToItinerary(
  offer: DuffelOffer,
  request: CanonicalSearchRequest,
  originalAmount?: number,
  originalCurrency?: string,
): CanonicalItinerary {
  const journeys: Journey[] = offer.slices.map((slice): Journey => {
    const segments: CanonicalSegment[] = slice.segments.map(
      (seg): CanonicalSegment => {
        const cabin = toCabinClass(seg.passengers[0]?.cabin_class ?? "economy")
        return {
          origin: seg.origin.iata_code,
          destination: seg.destination.iata_code,
          departure: seg.departing_at,
          arrival: seg.arriving_at,
          marketingCarrier: seg.marketing_carrier.iata_code,
          operatingCarrier: seg.operating_carrier.iata_code,
          marketingFlightNumber: seg.marketing_carrier_flight_number,
          operatingFlightNumber: seg.operating_carrier_flight_number,
          durationMinutes: parseIsoDuration(seg.duration),
          stops: seg.stops.length,
          equipment: seg.aircraft?.iata_code,
          cabin,
        }
      },
    )

    return {
      origin: slice.origin.iata_code,
      destination: slice.destination.iata_code,
      departureDate: segments[0]?.departure.slice(0, 10) ?? "",
      segments,
      layovers: computeLayovers(segments),
    }
  })

  // Build fares — one per passenger type
  const adultPax = offer.passengers.filter((p) => p.type === "adult")
  const childPax = offer.passengers.filter((p) => p.type === "child")
  const infantPax = offer.passengers.filter(
    (p) => p.type === "infant_without_seat",
  )
  const totalPax = offer.passengers.length || 1

  const totalAmount = Number(offer.total_amount)
  const baseAmount = Number(offer.base_amount)
  const taxAmount = Number(offer.tax_amount)

  const fares: CanonicalFare[] = []
  if (adultPax.length > 0) {
    const perPax = Math.round((totalAmount / totalPax) * 100) / 100
    const perPaxBase = Math.round((baseAmount / totalPax) * 100) / 100
    const perPaxTax = Math.round((taxAmount / totalPax) * 100) / 100
    fares.push({
      currency: offer.total_currency,
      baseAmount: perPaxBase,
      taxAmount: perPaxTax,
      totalAmount: perPax,
      passengerType: "ADT",
      count: adultPax.length,
    })
  }
  if (childPax.length > 0) {
    const perPax = Math.round((totalAmount / totalPax) * 100) / 100
    fares.push({
      currency: offer.total_currency,
      baseAmount: Math.round((baseAmount / totalPax) * 100) / 100,
      taxAmount: Math.round((taxAmount / totalPax) * 100) / 100,
      totalAmount: perPax,
      passengerType: "CHD",
      count: childPax.length,
    })
  }
  if (infantPax.length > 0) {
    const perPax = Math.round((totalAmount / totalPax) * 100) / 100
    fares.push({
      currency: offer.total_currency,
      baseAmount: Math.round((baseAmount / totalPax) * 100) / 100,
      taxAmount: Math.round((taxAmount / totalPax) * 100) / 100,
      totalAmount: perPax,
      passengerType: "INF",
      count: infantPax.length,
    })
  }

  // Baggage — take from first adult passenger in first segment
  const firstPassenger = offer.slices[0]?.segments[0]?.passengers[0]
  const checkedBaggages =
    firstPassenger?.baggages.filter((b) => b.type === "checked") ?? []
  const baggage: CanonicalBaggage = {
    cabin: true,
    checkedPieces: checkedBaggages.reduce((n, b) => n + b.quantity, 0) || 0,
  }

  const cond = offer.conditions
  const fareRules: CanonicalFareRules = {
    refundable: cond.refund_before_departure?.allowed ?? false,
    changeable: cond.change_before_departure?.allowed ?? false,
    changePenaltyAmount: cond.change_before_departure?.penalty_amount
      ? Number(cond.change_before_departure.penalty_amount)
      : undefined,
    changePenaltyCurrency: cond.change_before_departure?.penalty_currency,
  }

  const pricingToken = encodePricingToken({
    offerId: offer.id,
    passengerIds: offer.passengers.map((p) => p.id),
    originalAmount: originalAmount ?? Number(offer.total_amount),
    originalCurrency: originalCurrency ?? offer.total_currency,
  })

  return {
    tripType: request.tripType,
    journeys,
    fares,
    baggage,
    fareRules,
    provider: {
      provider: "duffel",
      providerOfferId: offer.id,
      pricingToken,
    },
    supplierTotalAmount: totalAmount,
    supplierCurrency: offer.total_currency,
    availableSeats: offer.available_seats,
  }
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

export function createDuffelAdapter(): GdsAdapter {
  return {
    name: "duffel",

    getConfigStatus() {
      return isDemoMode() ? "NOT_CONFIGURED" : "CONFIGURED"
    },

    async search(
      request: CanonicalSearchRequest,
    ): Promise<CanonicalSearchResult> {
      const passengers: Array<{ type: string; age?: number }> = [
        ...Array.from({ length: request.adults }, () => ({ type: "adult" })),
        ...Array.from({ length: request.children }, () => ({
          type: "child",
          age: 8,
        })),
        ...Array.from({ length: request.infants }, () => ({
          type: "infant_without_seat",
        })),
      ]

      let slices: Array<{
        origin: string
        destination: string
        departure_date: string
      }>

      if (request.tripType === "MULTI_CITY" && request.segments?.length) {
        slices = request.segments.map((seg) => ({
          origin: seg.origin,
          destination: seg.destination,
          departure_date: seg.departureDate,
        }))
      } else if (request.tripType === "ROUND_TRIP" && request.returnDate) {
        slices = [
          {
            origin: request.origin,
            destination: request.destination,
            departure_date: request.departureDate,
          },
          {
            origin: request.destination,
            destination: request.origin,
            departure_date: request.returnDate,
          },
        ]
      } else {
        slices = [
          {
            origin: request.origin,
            destination: request.destination,
            departure_date: request.departureDate,
          },
        ]
      }

      let offerRequest: DuffelOfferRequest
      try {
        offerRequest = await duffelFetch<DuffelOfferRequest>(
          "/air/offer_requests?return_offers=true",
          {
            method: "POST",
            body: JSON.stringify({
              data: {
                slices,
                passengers,
                cabin_class: fromCabinClass(request.cabin),
                currency: "TND",
              },
            }),
          },
        )
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Erreur Duffel search",
          code: "DUFFEL_SEARCH_ERROR",
        }
      }

      // Filter expired offers first (sync)
      const nonExpiredOffers = offerRequest.offers.filter(
        (offer) =>
          !(offer.expires_at && new Date(offer.expires_at) <= new Date()),
      )

      // Convert non-TND offers to TND using real exchange rate (async, fail-safe)
      const itineraries = (
        await Promise.all(
          nonExpiredOffers.map(
            async (offer): Promise<CanonicalItinerary | null> => {
              if (offer.total_currency === "TND") {
                return mapOfferToItinerary(offer, request)
              }
              // Non-TND: convert to TND using display-grade cached rate
              // If rate unavailable — skip offer silently, never fabricate
              try {
                const { rate } = await fetchExchangeRateForDisplay(
                  offer.total_currency,
                  "TND",
                )
                const convertedOffer: DuffelOffer = {
                  ...offer,
                  total_amount: String(
                    Math.round(Number(offer.total_amount) * rate * 1000) / 1000,
                  ),
                  base_amount: String(
                    Math.round(Number(offer.base_amount) * rate * 1000) / 1000,
                  ),
                  tax_amount: String(
                    Math.round(Number(offer.tax_amount) * rate * 1000) / 1000,
                  ),
                  total_currency: "TND",
                }
                return mapOfferToItinerary(
                  convertedOffer,
                  request,
                  Number(offer.total_amount),
                  offer.total_currency,
                )
              } catch {
                return null
              }
            },
          ),
        )
      ).filter((it): it is CanonicalItinerary => it !== null)

      return {
        ok: true,
        itineraries,
        searchId: offerRequest.id,
      }
    },

    async recheck(itinerary: CanonicalItinerary): Promise<RecheckResult> {
      const token = parsePricingToken(itinerary.provider.pricingToken)
      if (!token)
        return { status: "ERROR", error: "pricingToken Duffel manquant" }

      let offer: DuffelOffer
      try {
        offer = await duffelFetch<DuffelOffer>(`/air/offers/${token.offerId}`)
      } catch (err) {
        if (err instanceof Error && err.message.includes("422")) {
          return { status: "EXPIRED" }
        }
        return {
          status: "ERROR",
          error: err instanceof Error ? err.message : String(err),
        }
      }

      // Convert non-TND recheck price to TND using fresh (no-cache) booking rate
      let currentAmountTnd: number
      if (offer.total_currency === "TND") {
        currentAmountTnd = Number(offer.total_amount)
      } else {
        try {
          const { rate } = await fetchExchangeRateForBooking(
            offer.total_currency,
            "TND",
          )
          currentAmountTnd =
            Math.round(Number(offer.total_amount) * rate * 1000) / 1000
        } catch {
          return {
            status: "ERROR",
            error: `Taux de change indisponible pour ${offer.total_currency}`,
          }
        }
      }

      const originalAmountTnd = itinerary.supplierTotalAmount

      if (Math.abs(currentAmountTnd - originalAmountTnd) > 0.01) {
        return {
          status: "PRICE_CHANGED",
          currentSupplierAmount: currentAmountTnd,
          currentSupplierCurrency: "TND",
        }
      }

      return {
        status: "AVAILABLE",
        currentSupplierAmount: currentAmountTnd,
        currentSupplierCurrency: "TND",
      }
    },

    async book(
      itinerary: CanonicalItinerary,
      passengers: unknown[],
      contact: unknown,
    ): Promise<BookResult> {
      const token = parsePricingToken(itinerary.provider.pricingToken)
      if (!token) throw new Error("pricingToken Duffel manquant")

      const contactObj = contact as {
        email?: string
        firstName?: string
        lastName?: string
      }
      const paxRows = passengers as Array<{
        firstName: string
        lastName: string
        birthDate?: string | null
        passengerType?: string
        passportNumber?: string | null
        passportExpiry?: string | null
        nationality?: string | null
        sequence?: number
      }>

      const duffelPassengers = paxRows.map((pax, index) => {
        const duffelId = token.passengerIds[index]
        if (!duffelId)
          throw new Error(
            `Passenger ID Duffel manquant pour passager index ${index}`,
          )

        const paxData: Record<string, unknown> = {
          id: duffelId,
          title: "mx",
          given_name: pax.firstName,
          family_name: pax.lastName,
          email: contactObj.email ?? "noreply@easy2book.tn",
          phone_number: "+21600000000",
        }

        if (pax.birthDate) {
          paxData.born_on = pax.birthDate
        }

        if (pax.passportNumber && pax.nationality) {
          paxData.identity_documents = [
            {
              type: "passport",
              unique_identifier: pax.passportNumber,
              expires_on: pax.passportExpiry ?? undefined,
              issuing_country_code: pax.nationality.toUpperCase(),
            },
          ]
        }

        return paxData
      })

      const order = await duffelFetch<DuffelOrder>("/air/orders", {
        method: "POST",
        body: JSON.stringify({
          data: {
            selected_offers: [token.offerId],
            passengers: duffelPassengers,
            payments: [
              {
                type: "balance",
                // Pay Duffel in their original currency (EUR/USD), not TND
                amount: String(token.originalAmount ?? itinerary.supplierTotalAmount),
                currency: token.originalCurrency ?? itinerary.supplierCurrency,
              },
            ],
          },
        }),
      })

      return {
        pnr: order.id,
        supplierBookingReference: order.booking_reference,
        transactionId: order.id,
      }
    },

    async issue(
      pnr: string,
      _itinerary: CanonicalItinerary,
    ): Promise<IssueResult> {
      // pnr = order.id ("ord_...") stored by book()
      const order = await duffelFetch<DuffelOrder>(`/air/orders/${pnr}`)

      const tickets = order.documents
        .filter((doc) => doc.type === "electronic_ticket")
        .map((doc, index) => ({
          passengerRef: String(index + 1),
          ticketNumber: doc.unique_identifier,
          eticketUrl: doc.url,
        }))

      return { tickets }
    },

    async cancel(pnr: string, _itinerary: CanonicalItinerary): Promise<void> {
      // pnr = order.id ("ord_...") stored by book()
      await duffelFetch<unknown>("/air/order_cancellations", {
        method: "POST",
        body: JSON.stringify({
          data: { order_id: pnr },
        }),
      })
    },
  }
}
