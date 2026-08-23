import test from "node:test"
import assert from "node:assert/strict"
import { searchAcrossSuppliers } from "../core/orchestration"
import type { HotelSupplierDriver, SupplierSearchResult } from "../core/supplier"
import type { HotelSearchRequest, NormalizedHotel, SupplierName } from "../core/types"

function fakeDriver(
  supplier: SupplierName,
  behavior:
    | { kind: "success"; delayMs?: number; hotels?: NormalizedHotel[] }
    | { kind: "error"; delayMs?: number }
    | { kind: "hang" }
    | { kind: "not-configured" },
): HotelSupplierDriver {
  return {
    supplier,
    getConfigStatus: () => (behavior.kind === "not-configured" ? "NOT_CONFIGURED" : "CONFIGURED"),
    async search(): Promise<SupplierSearchResult> {
      if (behavior.kind === "hang") return new Promise(() => {}) // ne résout jamais — exercé par le timeout
      if (behavior.kind === "error") {
        if (behavior.delayMs) await new Promise((r) => setTimeout(r, behavior.delayMs))
        throw new Error(`${supplier} boom`)
      }
      if (behavior.kind === "not-configured") {
        // Jamais réellement appelé (l'orchestrateur court-circuite via getConfigStatus) — filet de sécurité typé.
        throw new Error(`${supplier} should not be called when NOT_CONFIGURED`)
      }
      if (behavior.delayMs) await new Promise((r) => setTimeout(r, behavior.delayMs))
      return { hotels: behavior.hotels ?? [], rates: [] }
    },
    getDetails: () => Promise.reject(new Error("not used in this test")),
    checkRate: () => Promise.reject(new Error("not used in this test")),
    book: () => Promise.reject(new Error("not used in this test")),
    getBooking: () => Promise.reject(new Error("not used in this test")),
    cancel: () => Promise.reject(new Error("not used in this test")),
  }
}

const REQUEST: HotelSearchRequest = {
  destinationId: "1",
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
  rooms: [{ adults: 2 }],
  currency: "TND",
}

test("searchAcrossSuppliers : un fournisseur lent (hang) n'empêche pas les autres de répondre", async () => {
  const fast = fakeDriver("cyberesa", { kind: "success" })
  const slow = fakeDriver("mygo", { kind: "hang" })
  const result = await searchAcrossSuppliers([fast, slow], REQUEST, { timeoutMs: 100 })
  assert.equal(result.supplierStatus.cyberesa, "SUCCESS")
  assert.equal(result.supplierStatus.mygo, "TIMEOUT")
  assert.ok(result.elapsedMs < 500, "ne doit pas attendre le fournisseur bloqué")
})

test("searchAcrossSuppliers : l'échec d'un fournisseur n'affecte jamais les résultats des autres (isolation)", async () => {
  const ok = fakeDriver("mygo", { kind: "success", hotels: [{ name: "Hotel OK", images: [], facilities: [], supplierMappings: [] }] })
  const broken = fakeDriver("3t", { kind: "error" })
  const result = await searchAcrossSuppliers([ok, broken], REQUEST)
  assert.equal(result.supplierStatus.mygo, "SUCCESS")
  assert.equal(result.supplierStatus["3t"], "ERROR")
  assert.equal(result.results.length, 1)
  assert.equal(result.failedSuppliers.includes("3t"), true)
  assert.equal(result.failedSuppliers.includes("mygo"), false)
})

test("searchAcrossSuppliers : un driver NOT_CONFIGURED est rapporté tel quel, jamais appelé, jamais un résultat fabriqué", async () => {
  const notConfigured = fakeDriver("tunisia-bed", { kind: "not-configured" })
  const result = await searchAcrossSuppliers([notConfigured], REQUEST)
  assert.equal(result.supplierStatus["tunisia-bed"], "NOT_CONFIGURED")
  assert.equal(result.results.length, 0)
})

test("searchAcrossSuppliers : tous les fournisseurs réussissent -> statut SUCCESS partout, aucun failedSuppliers", async () => {
  const a = fakeDriver("mygo", { kind: "success" })
  const b = fakeDriver("cyberesa", { kind: "success" })
  const result = await searchAcrossSuppliers([a, b], REQUEST)
  assert.equal(result.supplierStatus.mygo, "SUCCESS")
  assert.equal(result.supplierStatus.cyberesa, "SUCCESS")
  assert.equal(result.failedSuppliers.length, 0)
})

test("searchAcrossSuppliers : un correlationId est toujours renvoyé (fourni ou généré)", async () => {
  const a = fakeDriver("mygo", { kind: "success" })
  const withId = await searchAcrossSuppliers([a], REQUEST, { correlationId: "corr-123" })
  assert.equal(withId.correlationId, "corr-123")
  const withoutId = await searchAcrossSuppliers([a], REQUEST)
  assert.ok(withoutId.correlationId.length > 0)
})
