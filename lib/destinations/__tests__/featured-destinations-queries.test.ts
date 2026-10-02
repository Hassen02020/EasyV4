/**
 * R9-04 — tests unitaires lib/destinations/featured-destinations-queries.ts
 *
 * Vérifie que getFeaturedDestinations :
 * 1. FEATURED_DESTINATIONS_PAGE_SIZE est 6 (constante nommée, pas de magic number).
 * 2. Retourne [] quand la DB renvoie [].
 * 3. Respecte la limite par défaut (6).
 * 4. Respecte la limite explicite.
 * 5. Retourne au maximum les lignes disponibles.
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  getFeaturedDestinations,
  FEATURED_DESTINATIONS_PAGE_SIZE,
} from "../featured-destinations-queries.js"
import type { Destination } from "../../db/schema/destinations.js"

// -------------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------------

function makeDestination(n: number): Destination {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    type: "city" as const,
    parentId: `00000000-0000-0000-0001-${String(n).padStart(12, "0")}`,
    slug: `dest-${n}`,
    name: `Destination ${n}`,
    nameEn: null,
    nameAr: null,
    countryCode: null,
    region: null,
    latitude: null,
    longitude: null,
    coverMediaUrl: null,
    seoDescription: null,
    isActive: true,
    isFeatured: true,
    displayOrder: n,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockDb(allRows: Destination[]): any {
  const builder = {
    select: () => builder,
    from: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: (n: number) => Promise.resolve(allRows.slice(0, n)),
  }
  return builder
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

test("FEATURED_DESTINATIONS_PAGE_SIZE est 6", () => {
  assert.equal(FEATURED_DESTINATIONS_PAGE_SIZE, 6)
})

test("getFeaturedDestinations retourne [] si la DB est vide", async () => {
  const result = await getFeaturedDestinations(
    FEATURED_DESTINATIONS_PAGE_SIZE,
    mockDb([]),
  )
  assert.deepEqual(result, [])
})

test("getFeaturedDestinations respecte la limite par défaut (6)", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => makeDestination(i + 1))
  const result = await getFeaturedDestinations(
    FEATURED_DESTINATIONS_PAGE_SIZE,
    mockDb(rows),
  )
  assert.equal(result.length, 6)
})

test("getFeaturedDestinations respecte la limite explicite", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => makeDestination(i + 1))
  const result = await getFeaturedDestinations(3, mockDb(rows))
  assert.equal(result.length, 3)
})

test("getFeaturedDestinations retourne au maximum les lignes disponibles", async () => {
  const rows = Array.from({ length: 2 }, (_, i) => makeDestination(i + 1))
  const result = await getFeaturedDestinations(10, mockDb(rows))
  assert.equal(result.length, 2)
})
