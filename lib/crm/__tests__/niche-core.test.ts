/**
 * CRM-NICHE-01 — tests unitaires de computeNicheSegmentsCore, fonction
 * pure (aucun accès DB requis, contrairement à leads-core.test.ts).
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  computeNicheSegmentsCore,
  detectNicheSignalsCore,
  type NicheSegmentInputRow,
  type NicheSegment,
} from "../niche-core"

function row(over: Partial<NicheSegmentInputRow> = {}): NicheSegmentInputRow {
  return {
    market: "tunisia",
    productType: "package",
    intention: "standard",
    destination: null,
    status: "new",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    originAgencyId: null,
    capturedByUserId: null,
    channel: null,
    campaignRef: null,
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

test("NICHE-PROVENANCE-01 : regroupe aussi par originAgencyId × channel × campaignRef", () => {
  const segments = computeNicheSegmentsCore([
    row({ originAgencyId: "agency-a", channel: "whatsapp" }),
    row({ originAgencyId: "agency-a", channel: "whatsapp" }),
    row({ originAgencyId: "agency-b", channel: "whatsapp" }),
  ])
  assert.equal(segments.length, 2)
  const a = segments.find((s) => s.originAgencyId === "agency-a")
  const b = segments.find((s) => s.originAgencyId === "agency-b")
  assert.equal(a?.volume, 2)
  assert.equal(b?.volume, 1)
})

test("NICHE-PROVENANCE-01 : origine inconnue (null) jamais fusionnée avec une origine connue", () => {
  const segments = computeNicheSegmentsCore([
    row({ originAgencyId: null }),
    row({ originAgencyId: "agency-a" }),
  ])
  assert.equal(segments.length, 2)
  assert.equal(
    segments.some((s) => s.originAgencyId === null),
    true,
  )
  assert.equal(
    segments.some((s) => s.originAgencyId === "agency-a"),
    true,
  )
})

test("NICHE-PROVENANCE-01 : channel et campaignRef distinguent des leads par ailleurs identiques", () => {
  const segments = computeNicheSegmentsCore([
    row({ channel: "whatsapp", campaignRef: null }),
    row({ channel: "web", campaignRef: null }),
    row({ channel: "whatsapp", campaignRef: "facebook:ad123" }),
  ])
  assert.equal(segments.length, 3)
})

test("NICHE-PROVENANCE-01 : capturedByUserId (commercial apporteur) distingue des leads par ailleurs identiques, jamais fusionné avec un apporteur inconnu", () => {
  const segments = computeNicheSegmentsCore([
    row({ capturedByUserId: "user-a" }),
    row({ capturedByUserId: "user-a" }),
    row({ capturedByUserId: "user-b" }),
    row({ capturedByUserId: null }),
  ])
  assert.equal(segments.length, 3)
  const userA = segments.find((s) => s.capturedByUserId === "user-a")
  assert.equal(userA?.volume, 2)
  assert.equal(
    segments.some((s) => s.capturedByUserId === null),
    true,
  )
})

function segment(over: Partial<NicheSegment> = {}): NicheSegment {
  return {
    market: "tunisia",
    productType: "package",
    intention: "standard",
    destination: null,
    period: "2026-10",
    originAgencyId: null,
    capturedByUserId: null,
    channel: null,
    campaignRef: null,
    volume: 1,
    convertedCount: 0,
    conversionRate: 0,
    ...over,
  }
}

test("NICHE-SIGNAL-01 : aucun segment → aucun signal", () => {
  assert.deepEqual(detectNicheSignalsCore([]), [])
})

test("NICHE-SIGNAL-01 : segment au-dessus du seuil de concentration → signalé avec sa part réelle", () => {
  const signals = detectNicheSignalsCore(
    [
      segment({ destination: "Istanbul", volume: 30 }),
      segment({ destination: "Paris", volume: 70 }),
    ],
    20,
  )
  assert.equal(signals.length, 2)
  const istanbul = signals.find((s) => s.destination === "Istanbul")
  assert.equal(istanbul?.shareOfPeriod, 30)
})

test("NICHE-SIGNAL-01 : segment sous le seuil → jamais signalé", () => {
  const signals = detectNicheSignalsCore(
    [
      segment({ destination: "Istanbul", volume: 5 }),
      segment({ destination: "Paris", volume: 95 }),
    ],
    20,
  )
  assert.equal(signals.length, 1)
  assert.equal(signals[0]!.destination, "Paris")
})

test("NICHE-SIGNAL-01 : chaque période calcule sa propre part — jamais comparée entre périodes différentes", () => {
  const signals = detectNicheSignalsCore(
    [
      segment({ period: "2026-09", destination: "A", volume: 10 }),
      segment({ period: "2026-09", destination: "B", volume: 90 }),
      segment({ period: "2026-10", destination: "A", volume: 50 }),
      segment({ period: "2026-10", destination: "B", volume: 50 }),
    ],
    40,
  )
  // "A" en 2026-09 (10%) n'est jamais signalé même si "A" en 2026-10 (50%)
  // l'est — aucune comparaison inter-période (c'est NICHE-TREND-01).
  const aSeptember = signals.find(
    (s) => s.period === "2026-09" && s.destination === "A",
  )
  const aOctober = signals.find(
    (s) => s.period === "2026-10" && s.destination === "A",
  )
  assert.equal(aSeptember, undefined)
  assert.notEqual(aOctober, undefined)
})

test("NICHE-SIGNAL-01 : seuil par défaut (20%) appliqué si non fourni", () => {
  const signals = detectNicheSignalsCore([
    segment({ destination: "Istanbul", volume: 10 }),
    segment({ destination: "Paris", volume: 90 }),
  ])
  assert.equal(signals.length, 1)
  assert.equal(signals[0]!.destination, "Paris")
})

test("NICHE-SIGNAL-01 : tri par part décroissante", () => {
  const signals = detectNicheSignalsCore(
    [
      segment({ destination: "A", volume: 25 }),
      segment({ destination: "B", volume: 75 }),
    ],
    0,
  )
  assert.equal(signals[0]!.destination, "B")
  assert.equal(signals[1]!.destination, "A")
})
