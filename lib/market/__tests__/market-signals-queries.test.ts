/**
 * R9-02 — tests unitaires lib/market/queries.ts
 *
 * Vérifie que getLatestMarketSignals :
 * 1. Retourne [] quand la DB renvoie [] (section non affichée).
 * 2. Respecte la limite par défaut (SIGNALS_PAGE_SIZE = 6).
 * 3. Respecte la limite explicite passée en paramètre.
 * 4. SIGNALS_PAGE_SIZE est bien 6 (constante nommée, pas de magic number).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { getLatestMarketSignals, SIGNALS_PAGE_SIZE } from "../queries.js"
import type { MarketSignal } from "../../db/schema/market.js"

// -------------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------------

function makeSignal(n: number): MarketSignal {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    title: `Signal ${n}`,
    sourceUrl: `https://example.com/${n}`,
    publishedAt: new Date(
      `2026-10-${String(n % 28 || 1).padStart(2, "0")}T00:00:00Z`,
    ),
    confidence: "MEDIUM" as const,
    summary: null,
    category: null,
    region: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  }
}

// -------------------------------------------------------------------------
// Mock DB factory — retourne un objet qui imite le query builder Drizzle
// -------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockDb(allRows: MarketSignal[]): any {
  const builder = {
    select: () => builder,
    from: () => builder,
    orderBy: () => builder,
    limit: (n: number) => Promise.resolve(allRows.slice(0, n)),
  }
  return builder
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

test("SIGNALS_PAGE_SIZE est 6", () => {
  assert.equal(SIGNALS_PAGE_SIZE, 6)
})

test("getLatestMarketSignals retourne [] si la DB est vide", async () => {
  const result = await getLatestMarketSignals(SIGNALS_PAGE_SIZE, mockDb([]))
  assert.deepEqual(result, [])
})

test("getLatestMarketSignals respecte la limite par défaut (6)", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => makeSignal(i + 1))
  const result = await getLatestMarketSignals(SIGNALS_PAGE_SIZE, mockDb(rows))
  assert.equal(result.length, 6)
})

test("getLatestMarketSignals respecte la limite explicite", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => makeSignal(i + 1))
  const result = await getLatestMarketSignals(3, mockDb(rows))
  assert.equal(result.length, 3)
})

test("getLatestMarketSignals retourne au maximum les lignes disponibles", async () => {
  const rows = Array.from({ length: 2 }, (_, i) => makeSignal(i + 1))
  const result = await getLatestMarketSignals(10, mockDb(rows))
  assert.equal(result.length, 2)
})
