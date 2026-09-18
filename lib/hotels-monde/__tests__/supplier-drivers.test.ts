/**
 * PHASE PREMIUM 2 — Chantier 7 (Multi-supplier Hub, fondation minimale).
 * `searchAcrossWorldHotelDrivers()` est une fonction pure (pas de DB, pas
 * de `server-only`) — testée ici avec des drivers factices, indépendamment
 * du fournisseur virtuel réel ou de l'appel réseau réel. `getConfigStatus`
 * des deux vrais drivers (mutuellement exclusifs via WORLD_HOTELS_API_KEY)
 * est aussi vérifié, avec restauration systématique des env vars.
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  searchAcrossWorldHotelDrivers,
  createVirtualWorldHotelDriver,
  createWorldHotelApiDriver,
  type WorldHotelSupplierDriver,
} from "@/lib/hotels-monde/supplier-drivers"
import type { WorldHotelOffer, WorldHotelSearchInput } from "@/lib/hotels-monde/client"

const INPUT: WorldHotelSearchInput = {
  destination: "istanbul",
  checkIn: "2026-11-10",
  checkOut: "2026-11-13",
  nights: 3,
  adults: 2,
  rooms: 1,
}

function fakeOffer(id: string): WorldHotelOffer {
  return {
    id,
    name: `Hotel ${id}`,
    city: "Istanbul",
    country: "Turquie",
    stars: 4,
    rating: 8,
    reviewCount: 100,
    thumbnailUrl: null,
    pricePerNightTnd: 200,
    totalPriceTnd: 600,
    nights: 3,
    currency: "TND",
    refundable: true,
    breakfastIncluded: false,
    distanceFromCenterKm: 1,
    source: "virtual",
  }
}

function fakeDriver(
  name: string,
  status: "CONFIGURED" | "NOT_CONFIGURED",
  outcome: { offers: WorldHotelOffer[]; searchId: string } | Error,
  calls: string[],
): WorldHotelSupplierDriver {
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

test("searchAcrossWorldHotelDrivers — un seul driver CONFIGURED renvoie ses offres", async () => {
  const calls: string[] = []
  const drivers = [
    fakeDriver("virtual", "CONFIGURED", { offers: [fakeOffer("v1")], searchId: "s1" }, calls),
    fakeDriver("api", "NOT_CONFIGURED", { offers: [fakeOffer("a1")], searchId: "s2" }, calls),
  ]
  const result = await searchAcrossWorldHotelDrivers(drivers, INPUT)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.offers.map((o) => o.id), ["v1"])
    assert.equal(result.searchId, "s1")
  }
  // Le driver NOT_CONFIGURED n'est jamais appelé.
  assert.deepEqual(calls, ["virtual"])
})

test("searchAcrossWorldHotelDrivers — fusionne les offres de plusieurs drivers CONFIGURED", async () => {
  const calls: string[] = []
  const drivers = [
    fakeDriver("virtual", "CONFIGURED", { offers: [fakeOffer("v1")], searchId: "s1" }, calls),
    fakeDriver("api", "CONFIGURED", { offers: [fakeOffer("a1")], searchId: "s2" }, calls),
  ]
  const result = await searchAcrossWorldHotelDrivers(drivers, INPUT)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(
      result.offers.map((o) => o.id).sort(),
      ["a1", "v1"],
    )
  }
})

test("searchAcrossWorldHotelDrivers — isole un driver en échec, garde les résultats des autres", async () => {
  const calls: string[] = []
  const drivers = [
    fakeDriver("virtual", "CONFIGURED", { offers: [fakeOffer("v1")], searchId: "s1" }, calls),
    fakeDriver("api", "CONFIGURED", new Error("API en panne"), calls),
  ]
  const result = await searchAcrossWorldHotelDrivers(drivers, INPUT)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.offers.map((o) => o.id), ["v1"])
  }
})

test("searchAcrossWorldHotelDrivers — tous les drivers CONFIGURED échouent → ok:false", async () => {
  const calls: string[] = []
  const drivers = [fakeDriver("virtual", "CONFIGURED", new Error("panne totale"), calls)]
  const result = await searchAcrossWorldHotelDrivers(drivers, INPUT)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, "WORLD_HOTELS_API_ERROR")
    assert.match(result.error, /panne totale/)
  }
})

test("searchAcrossWorldHotelDrivers — aucun driver CONFIGURED → NO_SUPPLIER_CONFIGURED", async () => {
  const calls: string[] = []
  const drivers = [fakeDriver("virtual", "NOT_CONFIGURED", { offers: [], searchId: "s" }, calls)]
  const result = await searchAcrossWorldHotelDrivers(drivers, INPUT)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "NO_SUPPLIER_CONFIGURED")
  assert.deepEqual(calls, [])
})

test("virtual/api drivers réels — mutuellement exclusifs via WORLD_HOTELS_API_KEY (comportement historique préservé)", () => {
  const prevKey = process.env.WORLD_HOTELS_API_KEY
  const prevDemo = process.env.WORLD_HOTELS_DEMO_MODE
  try {
    delete process.env.WORLD_HOTELS_API_KEY
    delete process.env.WORLD_HOTELS_DEMO_MODE
    assert.equal(createVirtualWorldHotelDriver().getConfigStatus(), "CONFIGURED")
    assert.equal(createWorldHotelApiDriver().getConfigStatus(), "NOT_CONFIGURED")

    process.env.WORLD_HOTELS_API_KEY = "fake-key"
    assert.equal(createVirtualWorldHotelDriver().getConfigStatus(), "NOT_CONFIGURED")
    assert.equal(createWorldHotelApiDriver().getConfigStatus(), "CONFIGURED")

    process.env.WORLD_HOTELS_DEMO_MODE = "true"
    assert.equal(createVirtualWorldHotelDriver().getConfigStatus(), "CONFIGURED")
    assert.equal(createWorldHotelApiDriver().getConfigStatus(), "NOT_CONFIGURED")
  } finally {
    if (prevKey === undefined) delete process.env.WORLD_HOTELS_API_KEY
    else process.env.WORLD_HOTELS_API_KEY = prevKey
    if (prevDemo === undefined) delete process.env.WORLD_HOTELS_DEMO_MODE
    else process.env.WORLD_HOTELS_DEMO_MODE = prevDemo
  }
})
