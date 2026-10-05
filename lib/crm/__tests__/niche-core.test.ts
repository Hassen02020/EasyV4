/**
 * CRM-NICHE-01 — tests unitaires de computeNicheSegmentsCore, fonction
 * pure (aucun accès DB requis, contrairement à leads-core.test.ts).
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  computeNicheSegmentsCore,
  type NicheSegmentInputRow,
} from "../niche-core"

function row(over: Partial<NicheSegmentInputRow> = {}): NicheSegmentInputRow {
  return {
    market: "tunisia",
    productType: "package",
    intention: "standard",
    destination: null,
    status: "new",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...over,
  }
}

test("liste vide → aucun segment", () => {
  assert.deepEqual(computeNicheSegmentsCore([]), [])
})

test("regroupe par marché × produit × intention × destination × période", () => {
  const segments = computeNicheSegmentsCore([
    row({ destination: "Istanbul" }),
    row({ destination: "Istanbul" }),
    row({ destination: "Paris" }),
  ])
  assert.equal(segments.length, 2)
  const istanbul = segments.find((s) => s.destination === "Istanbul")
  const paris = segments.find((s) => s.destination === "Paris")
  assert.equal(istanbul?.volume, 2)
  assert.equal(paris?.volume, 1)
})

test("période distincte → segments distincts même si tout le reste est identique", () => {
  const segments = computeNicheSegmentsCore([
    row({ createdAt: new Date("2026-10-01T00:00:00Z") }),
    row({ createdAt: new Date("2026-11-01T00:00:00Z") }),
  ])
  assert.equal(segments.length, 2)
  assert.deepEqual(segments.map((s) => s.period).sort(), ["2026-10", "2026-11"])
})

test("taux de conversion = convertis / volume, arrondi, jamais de division par zéro", () => {
  const segments = computeNicheSegmentsCore([
    row({ status: "converted" }),
    row({ status: "new" }),
    row({ status: "closed" }),
  ])
  assert.equal(segments.length, 1)
  assert.equal(segments[0]!.volume, 3)
  assert.equal(segments[0]!.convertedCount, 1)
  assert.equal(segments[0]!.conversionRate, 33)
})

test("destination absente (null) regroupée séparément d'une destination renseignée", () => {
  const segments = computeNicheSegmentsCore([
    row({ destination: null }),
    row({ destination: "Rome" }),
  ])
  assert.equal(segments.length, 2)
})

test("3 dimensions (marché, intention, produit) distinguent bien des leads par ailleurs identiques", () => {
  const segments = computeNicheSegmentsCore([
    row({ market: "tunisia", intention: "groupe", productType: "package" }),
    row({ market: "tunisia", intention: "transfert", productType: "package" }),
    row({ market: "tunisia", intention: "groupe", productType: "hotel" }),
  ])
  assert.equal(segments.length, 3)
})

test("tri par volume décroissant", () => {
  const segments = computeNicheSegmentsCore([
    row({ destination: "A" }),
    row({ destination: "B" }),
    row({ destination: "B" }),
    row({ destination: "B" }),
  ])
  assert.equal(segments[0]!.destination, "B")
  assert.equal(segments[0]!.volume, 3)
})
