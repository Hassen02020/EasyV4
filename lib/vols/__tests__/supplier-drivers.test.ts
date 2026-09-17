/**
 * PHASE PREMIUM 2 — Chantier 7 (Multi-supplier Hub, fondation minimale).
 * Miroir de lib/hotels-monde/__tests__/supplier-drivers.test.ts — voir ce
 * fichier pour la justification (fonction pure, drivers factices, pas de
 * dépendance DB/server-only).
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  searchAcrossFlightDrivers,
  createVirtualFlightDriver,
  createFlightApiDriver,
  type FlightSupplierDriver,
} from "@/lib/vols/supplier-drivers"
import type { FlightOffer, FlightSearchInput } from "@/lib/vols/client"

const INPUT: FlightSearchInput = {
  originCode: "TUN",
  destinationCode: "IST",
  departureDate: "2026-11-10",
  adults: 1,
}

function fakeOffer(id: string): FlightOffer {
  return {
    id,
    segments: [
      {
        origin: "TUN",
        destination: "IST",
        departureAt: "2026-11-10T08:00:00Z",
        arrivalAt: "2026-11-10T11:00:00Z",
        carrier: "TU",
        flightNumber: "TU123",
        duration: "PT3H",
        cabin: "ECONOMY",
      },
    ],
    stops: 0,
    totalDurationMinutes: 180,
    priceTnd: 500,
    currency: "TND",
    availableSeats: 9,
    refundable: true,
    baggageKg: 20,
    source: "virtual",
  }
}

function fakeDriver(
  name: string,
  status: "CONFIGURED" | "NOT_CONFIGURED",
  outcome: { offers: FlightOffer[]; searchId: string } | Error,
  calls: string[],
): FlightSupplierDriver {
  return {
    name,
    getConfigStatus: () => status,
    search: async () => {
      calls.push(name)
      if (outcome instanceof Error) throw outcome
      return outcome
    },
  }
}

test("searchAcrossFlightDrivers — un seul driver CONFIGURED renvoie ses offres", async () => {
  const calls: string[] = []
  const drivers = [
    fakeDriver("virtual", "CONFIGURED", { offers: [fakeOffer("v1")], searchId: "s1" }, calls),
    fakeDriver("api", "NOT_CONFIGURED", { offers: [fakeOffer("a1")], searchId: "s2" }, calls),
  ]
  const result = await searchAcrossFlightDrivers(drivers, INPUT)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.offers.map((o) => o.id), ["v1"])
    assert.equal(result.searchId, "s1")
  }
  assert.deepEqual(calls, ["virtual"])
})

test("searchAcrossFlightDrivers — fusionne les offres de plusieurs drivers CONFIGURED", async () => {
  const calls: string[] = []
  const drivers = [
    fakeDriver("virtual", "CONFIGURED", { offers: [fakeOffer("v1")], searchId: "s1" }, calls),
    fakeDriver("api", "CONFIGURED", { offers: [fakeOffer("a1")], searchId: "s2" }, calls),
  ]
  const result = await searchAcrossFlightDrivers(drivers, INPUT)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(
      result.offers.map((o) => o.id).sort(),
      ["a1", "v1"],
    )
  }
})

test("searchAcrossFlightDrivers — isole un driver en échec, garde les résultats des autres", async () => {
  const calls: string[] = []
  const drivers = [
    fakeDriver("virtual", "CONFIGURED", { offers: [fakeOffer("v1")], searchId: "s1" }, calls),
    fakeDriver("api", "CONFIGURED", new Error("API en panne"), calls),
  ]
  const result = await searchAcrossFlightDrivers(drivers, INPUT)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.offers.map((o) => o.id), ["v1"])
  }
})

test("searchAcrossFlightDrivers — tous les drivers CONFIGURED échouent → ok:false", async () => {
  const calls: string[] = []
  const drivers = [fakeDriver("virtual", "CONFIGURED", new Error("panne totale"), calls)]
  const result = await searchAcrossFlightDrivers(drivers, INPUT)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, "FLIGHTS_API_ERROR")
    assert.match(result.error, /panne totale/)
  }
})

test("searchAcrossFlightDrivers — aucun driver CONFIGURED → NO_SUPPLIER_CONFIGURED", async () => {
  const calls: string[] = []
  const drivers = [fakeDriver("virtual", "NOT_CONFIGURED", { offers: [], searchId: "s" }, calls)]
  const result = await searchAcrossFlightDrivers(drivers, INPUT)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "NO_SUPPLIER_CONFIGURED")
  assert.deepEqual(calls, [])
})

test("virtual/api drivers réels — mutuellement exclusifs via FLIGHTS_API_KEY (comportement historique préservé)", () => {
  const prevKey = process.env.FLIGHTS_API_KEY
  const prevDemo = process.env.FLIGHTS_DEMO_MODE
  try {
    delete process.env.FLIGHTS_API_KEY
    delete process.env.FLIGHTS_DEMO_MODE
    assert.equal(createVirtualFlightDriver().getConfigStatus(), "CONFIGURED")
    assert.equal(createFlightApiDriver().getConfigStatus(), "NOT_CONFIGURED")

    process.env.FLIGHTS_API_KEY = "fake-key"
    assert.equal(createVirtualFlightDriver().getConfigStatus(), "NOT_CONFIGURED")
    assert.equal(createFlightApiDriver().getConfigStatus(), "CONFIGURED")

    process.env.FLIGHTS_DEMO_MODE = "true"
    assert.equal(createVirtualFlightDriver().getConfigStatus(), "CONFIGURED")
    assert.equal(createFlightApiDriver().getConfigStatus(), "NOT_CONFIGURED")
  } finally {
    if (prevKey === undefined) delete process.env.FLIGHTS_API_KEY
    else process.env.FLIGHTS_API_KEY = prevKey
    if (prevDemo === undefined) delete process.env.FLIGHTS_DEMO_MODE
    else process.env.FLIGHTS_DEMO_MODE = prevDemo
  }
})
