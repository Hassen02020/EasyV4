/**
 * DUFFEL-ADAPTER-01 — tests unitaires.
 * Toutes les interactions réseau sont mockées via globalThis.fetch ;
 * aucune clé réelle, aucun appel réseau.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { createDuffelAdapter } from "@/lib/vols/adapters/duffel"
import type { CanonicalItinerary, CanonicalSearchRequest } from "@/lib/vols/canonical"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encodePricingToken(data: { offerId: string; passengerIds: string[] }): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url")
}

function makeOffer(overrides: Partial<{
  id: string
  total_amount: string
  total_currency: string
  base_amount: string
  tax_amount: string
  available_seats: number | null
  conditions: Record<string, unknown>
  expires_at: string
}> = {}) {
  return {
    id: overrides.id ?? "off_test123",
    total_amount: overrides.total_amount ?? "310.52",
    total_currency: overrides.total_currency ?? "TND",
    base_amount: overrides.base_amount ?? "280.00",
    tax_amount: overrides.tax_amount ?? "30.52",
    available_seats: overrides.available_seats ?? 5,
    expires_at: overrides.expires_at ?? new Date(Date.now() + 3_600_000).toISOString(),
    conditions: overrides.conditions ?? {
      refund_before_departure: { allowed: false },
      change_before_departure: { allowed: true, penalty_amount: "50.00", penalty_currency: "TND" },
    },
    slices: [
      {
        id: "sli_1",
        origin: { iata_code: "TUN" },
        destination: { iata_code: "CDG" },
        segments: [
          {
            id: "seg_1",
            origin: { iata_code: "TUN" },
            destination: { iata_code: "CDG" },
            departing_at: "2026-11-10T08:30:00Z",
            arriving_at: "2026-11-10T12:00:00Z",
            duration: "PT3H30M",
            marketing_carrier: { iata_code: "TU" },
            operating_carrier: { iata_code: "TU" },
            marketing_carrier_flight_number: "701",
            aircraft: { iata_code: "B738" },
            passengers: [
              {
                cabin_class: "economy",
                cabin_class_marketing_name: "Economy",
                baggages: [{ type: "checked", quantity: 1 }],
              },
            ],
            stops: [],
          },
        ],
      },
    ],
    passengers: [{ id: "pas_0aaa", type: "adult" }],
  }
}

function mockFetch(responses: Array<{ ok: boolean; data?: unknown; errors?: unknown[] }>) {
  let callIndex = 0
  const saved = globalThis.fetch
  globalThis.fetch = async (_url: unknown, _init?: unknown) => {
    const resp = responses[callIndex++]
    if (!resp) throw new Error("mockFetch: unexpected extra call")
    return {
      ok: resp.ok,
      status: resp.ok ? 200 : 422,
      statusText: resp.ok ? "OK" : "Unprocessable Entity",
      json: async () => {
        if (!resp.ok) return { errors: resp.errors ?? [{ message: "mock error" }] }
        return { data: resp.data }
      },
    } as Response
  }
  return () => { globalThis.fetch = saved }
}

const BASE_REQUEST: CanonicalSearchRequest = {
  tripType: "ONE_WAY",
  origin: "TUN",
  destination: "CDG",
  departureDate: "2026-11-10",
  adults: 1,
  children: 0,
  infants: 0,
  cabin: "ECONOMY",
  currency: "TND",
}

function makeItineraryFromOffer(offerId = "off_test123", passengerIds = ["pas_0aaa"]): CanonicalItinerary {
  return {
    tripType: "ONE_WAY",
    journeys: [
      {
        origin: "TUN",
        destination: "CDG",
        departureDate: "2026-11-10",
        segments: [
          {
            origin: "TUN",
            destination: "CDG",
            departure: "2026-11-10T08:30:00Z",
            arrival: "2026-11-10T12:00:00Z",
            marketingCarrier: "TU",
            operatingCarrier: "TU",
            marketingFlightNumber: "701",
            durationMinutes: 210,
            stops: 0,
            cabin: "ECONOMY",
          },
        ],
        layovers: [],
      },
    ],
    fares: [{ currency: "TND", baseAmount: 280, taxAmount: 30.52, totalAmount: 310.52, passengerType: "ADT", count: 1 }],
    baggage: { cabin: true, checkedPieces: 1 },
    fareRules: { refundable: false, changeable: true },
    provider: {
      provider: "duffel",
      providerOfferId: offerId,
      pricingToken: encodePricingToken({ offerId, passengerIds }),
    },
    supplierTotalAmount: 310.52,
    supplierCurrency: "TND",
    availableSeats: 5,
  }
}

// ---------------------------------------------------------------------------
// T1 — getConfigStatus
// ---------------------------------------------------------------------------

test("T1 — getConfigStatus : NOT_CONFIGURED sans token", () => {
  const prev = process.env.DUFFEL_ACCESS_TOKEN
  const prevDemo = process.env.FLIGHTS_DEMO_MODE
  try {
    delete process.env.DUFFEL_ACCESS_TOKEN
    delete process.env.FLIGHTS_DEMO_MODE
    assert.equal(createDuffelAdapter().getConfigStatus(), "NOT_CONFIGURED")
  } finally {
    if (prev === undefined) delete process.env.DUFFEL_ACCESS_TOKEN
    else process.env.DUFFEL_ACCESS_TOKEN = prev
    if (prevDemo === undefined) delete process.env.FLIGHTS_DEMO_MODE
    else process.env.FLIGHTS_DEMO_MODE = prevDemo
  }
})

test("T1 — getConfigStatus : CONFIGURED avec token sans FLIGHTS_DEMO_MODE", () => {
  const prev = process.env.DUFFEL_ACCESS_TOKEN
  const prevDemo = process.env.FLIGHTS_DEMO_MODE
  try {
    process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
    delete process.env.FLIGHTS_DEMO_MODE
    assert.equal(createDuffelAdapter().getConfigStatus(), "CONFIGURED")
  } finally {
    if (prev === undefined) delete process.env.DUFFEL_ACCESS_TOKEN
    else process.env.DUFFEL_ACCESS_TOKEN = prev
    if (prevDemo === undefined) delete process.env.FLIGHTS_DEMO_MODE
    else process.env.FLIGHTS_DEMO_MODE = prevDemo
  }
})

test("T1 — getConfigStatus : NOT_CONFIGURED si FLIGHTS_DEMO_MODE=true même avec token", () => {
  const prev = process.env.DUFFEL_ACCESS_TOKEN
  const prevDemo = process.env.FLIGHTS_DEMO_MODE
  try {
    process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
    process.env.FLIGHTS_DEMO_MODE = "true"
    assert.equal(createDuffelAdapter().getConfigStatus(), "NOT_CONFIGURED")
  } finally {
    if (prev === undefined) delete process.env.DUFFEL_ACCESS_TOKEN
    else process.env.DUFFEL_ACCESS_TOKEN = prev
    if (prevDemo === undefined) delete process.env.FLIGHTS_DEMO_MODE
    else process.env.FLIGHTS_DEMO_MODE = prevDemo
  }
})

// ---------------------------------------------------------------------------
// T2 — search()
// ---------------------------------------------------------------------------

test("T2 — search() : mappe offre Duffel → CanonicalItinerary TND", async () => {
  process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
  const restore = mockFetch([{ ok: true, data: { id: "orq_1", offers: [makeOffer()] } }])
  try {
    const result = await createDuffelAdapter().search(BASE_REQUEST)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.itineraries.length, 1)
    const it = result.itineraries[0]!
    assert.equal(it.provider.provider, "duffel")
    assert.equal(it.provider.providerOfferId, "off_test123")
    assert.equal(it.supplierCurrency, "TND")
    assert.equal(it.supplierTotalAmount, 310.52)
    assert.equal(it.journeys[0]!.segments[0]!.origin, "TUN")
    assert.equal(it.journeys[0]!.segments[0]!.durationMinutes, 210)
    assert.equal(it.journeys[0]!.segments[0]!.cabin, "ECONOMY")
    assert.equal(it.baggage.checkedPieces, 1)
    assert.equal(it.fareRules.refundable, false)
    assert.equal(it.fareRules.changeable, true)
    assert.equal(it.availableSeats, 5)
  } finally {
    restore()
    delete process.env.DUFFEL_ACCESS_TOKEN
  }
})

test("T2 — search() : exclut offres non-TND (CURRENCY-DIM-01a)", async () => {
  process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
  const restore = mockFetch([
    {
      ok: true,
      data: {
        id: "orq_2",
        offers: [
          makeOffer({ id: "off_eur", total_currency: "EUR" }),
          makeOffer({ id: "off_tnd", total_currency: "TND" }),
        ],
      },
    },
  ])
  try {
    const result = await createDuffelAdapter().search(BASE_REQUEST)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.itineraries.length, 1)
    assert.equal(result.itineraries[0]!.provider.providerOfferId, "off_tnd")
  } finally {
    restore()
    delete process.env.DUFFEL_ACCESS_TOKEN
  }
})

test("T2 — search() : retourne ok:false si Duffel échoue", async () => {
  process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
  const restore = mockFetch([{ ok: false, errors: [{ message: "Service indisponible" }] }])
  try {
    const result = await createDuffelAdapter().search(BASE_REQUEST)
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.match(result.error, /Service indisponible/)
  } finally {
    restore()
    delete process.env.DUFFEL_ACCESS_TOKEN
  }
})

// ---------------------------------------------------------------------------
// T3 — recheck()
// ---------------------------------------------------------------------------

test("T3 — recheck() : AVAILABLE si prix inchangé", async () => {
  process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
  const restore = mockFetch([{ ok: true, data: makeOffer() }])
  try {
    const result = await createDuffelAdapter().recheck(makeItineraryFromOffer())
    assert.equal(result.status, "AVAILABLE")
    assert.equal(result.currentSupplierAmount, 310.52)
  } finally {
    restore()
    delete process.env.DUFFEL_ACCESS_TOKEN
  }
})

test("T3 — recheck() : PRICE_CHANGED si montant différent", async () => {
  process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
  const restore = mockFetch([{ ok: true, data: makeOffer({ total_amount: "350.00" }) }])
  try {
    const result = await createDuffelAdapter().recheck(makeItineraryFromOffer())
    assert.equal(result.status, "PRICE_CHANGED")
    assert.equal(result.currentSupplierAmount, 350)
  } finally {
    restore()
    delete process.env.DUFFEL_ACCESS_TOKEN
  }
})

test("T3 — recheck() : EXPIRED si Duffel renvoie 422", async () => {
  process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
  const restore = mockFetch([{ ok: false, errors: [{ message: "422" }] }])
  try {
    const result = await createDuffelAdapter().recheck(makeItineraryFromOffer())
    assert.equal(result.status, "EXPIRED")
  } finally {
    restore()
    delete process.env.DUFFEL_ACCESS_TOKEN
  }
})

// ---------------------------------------------------------------------------
// T4 — book()
// ---------------------------------------------------------------------------

test("T4 — book() : crée un Order et renvoie pnr=order.id", async () => {
  process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
  const restore = mockFetch([
    {
      ok: true,
      data: {
        id: "ord_abc",
        booking_reference: "XYZ123",
        documents: [],
      },
    },
  ])
  try {
    const passengers = [
      { firstName: "Ahmed", lastName: "Ben Ali", birthDate: "1990-05-15", passengerType: "ADT", sequence: 1 },
    ]
    const contact = { email: "ahmed@example.com", firstName: "Ahmed", lastName: "Ben Ali" }
    const result = await createDuffelAdapter().book(makeItineraryFromOffer(), passengers, contact)
    assert.equal(result.pnr, "ord_abc")
    assert.equal(result.supplierBookingReference, "XYZ123")
  } finally {
    restore()
    delete process.env.DUFFEL_ACCESS_TOKEN
  }
})

// ---------------------------------------------------------------------------
// T5 — issue()
// ---------------------------------------------------------------------------

test("T5 — issue() : extrait e-tickets de l'Order", async () => {
  process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
  const restore = mockFetch([
    {
      ok: true,
      data: {
        id: "ord_abc",
        booking_reference: "XYZ123",
        documents: [
          { type: "electronic_ticket", passenger_id: "pas_0aaa", unique_identifier: "2281234567890", url: "https://e-ticket.example.com/1" },
        ],
      },
    },
  ])
  try {
    const result = await createDuffelAdapter().issue("ord_abc", makeItineraryFromOffer())
    assert.equal(result.tickets.length, 1)
    assert.equal(result.tickets[0]!.ticketNumber, "2281234567890")
    assert.equal(result.tickets[0]!.eticketUrl, "https://e-ticket.example.com/1")
  } finally {
    restore()
    delete process.env.DUFFEL_ACCESS_TOKEN
  }
})

// ---------------------------------------------------------------------------
// T6 — cancel()
// ---------------------------------------------------------------------------

test("T6 — cancel() : crée une OrderCancellation sans lever", async () => {
  process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
  const restore = mockFetch([{ ok: true, data: { id: "ore_cancel123" } }])
  try {
    await assert.doesNotReject(() =>
      createDuffelAdapter().cancel("ord_abc", makeItineraryFromOffer()),
    )
  } finally {
    restore()
    delete process.env.DUFFEL_ACCESS_TOKEN
  }
})

// ---------------------------------------------------------------------------
// T7 — orchestrator isolation (virtual + duffel via fake adapters)
// ---------------------------------------------------------------------------

test("T7 — virtual yield : virtual NOT_CONFIGURED quand DUFFEL_ACCESS_TOKEN présent", () => {
  const prevDuffel = process.env.DUFFEL_ACCESS_TOKEN
  const prevFlights = process.env.FLIGHTS_API_KEY
  const prevDemo = process.env.FLIGHTS_DEMO_MODE
  try {
    process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
    delete process.env.FLIGHTS_API_KEY
    delete process.env.FLIGHTS_DEMO_MODE
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createVirtualGdsAdapter } = require("@/lib/vols/adapters/virtual")
    assert.equal(createVirtualGdsAdapter().getConfigStatus(), "NOT_CONFIGURED")
    assert.equal(createDuffelAdapter().getConfigStatus(), "CONFIGURED")
  } finally {
    if (prevDuffel === undefined) delete process.env.DUFFEL_ACCESS_TOKEN
    else process.env.DUFFEL_ACCESS_TOKEN = prevDuffel
    if (prevFlights === undefined) delete process.env.FLIGHTS_API_KEY
    else process.env.FLIGHTS_API_KEY = prevFlights
    if (prevDemo === undefined) delete process.env.FLIGHTS_DEMO_MODE
    else process.env.FLIGHTS_DEMO_MODE = prevDemo
  }
})

test("T7 — virtual CONFIGURED quand FLIGHTS_DEMO_MODE=true même avec token", () => {
  const prevDuffel = process.env.DUFFEL_ACCESS_TOKEN
  const prevDemo = process.env.FLIGHTS_DEMO_MODE
  try {
    process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
    process.env.FLIGHTS_DEMO_MODE = "true"
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createVirtualGdsAdapter } = require("@/lib/vols/adapters/virtual")
    assert.equal(createVirtualGdsAdapter().getConfigStatus(), "CONFIGURED")
    assert.equal(createDuffelAdapter().getConfigStatus(), "NOT_CONFIGURED")
  } finally {
    if (prevDuffel === undefined) delete process.env.DUFFEL_ACCESS_TOKEN
    else process.env.DUFFEL_ACCESS_TOKEN = prevDuffel
    if (prevDemo === undefined) delete process.env.FLIGHTS_DEMO_MODE
    else process.env.FLIGHTS_DEMO_MODE = prevDemo
  }
})

// ---------------------------------------------------------------------------
// T8 — currency guard : offre EUR exclue même si seule disponible
// ---------------------------------------------------------------------------

test("T8 — CURRENCY-DIM-01a : aucune offre TND → result.ok=true itineraries=[]", async () => {
  process.env.DUFFEL_ACCESS_TOKEN = "duffel_test_fake_key"
  const restore = mockFetch([
    {
      ok: true,
      data: {
        id: "orq_eur",
        offers: [
          makeOffer({ id: "off_eur1", total_currency: "EUR" }),
          makeOffer({ id: "off_usd1", total_currency: "USD" }),
        ],
      },
    },
  ])
  try {
    const result = await createDuffelAdapter().search(BASE_REQUEST)
    assert.equal(result.ok, true)
    if (!result.ok) return
    // All non-TND offers excluded — never a fabricated conversion
    assert.equal(result.itineraries.length, 0)
  } finally {
    restore()
    delete process.env.DUFFEL_ACCESS_TOKEN
  }
})
