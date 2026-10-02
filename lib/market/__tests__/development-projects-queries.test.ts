/**
 * R9-03 — tests unitaires lib/market/development-projects-queries.ts
 *
 * Vérifie que getLatestDevelopmentProjects :
 * 1. DEVELOPMENT_PROJECTS_PAGE_SIZE est 4 (constante nommée, pas de magic number).
 * 2. Retourne [] quand la DB renvoie [].
 * 3. Respecte la limite par défaut (4).
 * 4. Respecte la limite explicite.
 * 5. Retourne au maximum les lignes disponibles.
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  getLatestDevelopmentProjects,
  DEVELOPMENT_PROJECTS_PAGE_SIZE,
} from "../development-projects-queries.js"
import type { DevelopmentProject } from "../../db/schema/market.js"

// -------------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------------

function makeProject(n: number): DevelopmentProject {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    name: `Projet ${n}`,
    sourceUrl: `https://example.com/project/${n}`,
    publishedAt: new Date(
      `2026-10-${String(n % 28 || 1).padStart(2, "0")}T00:00:00Z`,
    ),
    confidence: "MEDIUM" as const,
    description: null,
    location: null,
    projectType: null,
    status: "ANNOUNCED",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockDb(allRows: DevelopmentProject[]): any {
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

test("DEVELOPMENT_PROJECTS_PAGE_SIZE est 4", () => {
  assert.equal(DEVELOPMENT_PROJECTS_PAGE_SIZE, 4)
})

test("getLatestDevelopmentProjects retourne [] si la DB est vide", async () => {
  const result = await getLatestDevelopmentProjects(
    DEVELOPMENT_PROJECTS_PAGE_SIZE,
    mockDb([]),
  )
  assert.deepEqual(result, [])
})

test("getLatestDevelopmentProjects respecte la limite par défaut (4)", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => makeProject(i + 1))
  const result = await getLatestDevelopmentProjects(
    DEVELOPMENT_PROJECTS_PAGE_SIZE,
    mockDb(rows),
  )
  assert.equal(result.length, 4)
})

test("getLatestDevelopmentProjects respecte la limite explicite", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => makeProject(i + 1))
  const result = await getLatestDevelopmentProjects(2, mockDb(rows))
  assert.equal(result.length, 2)
})

test("getLatestDevelopmentProjects retourne au maximum les lignes disponibles", async () => {
  const rows = Array.from({ length: 3 }, (_, i) => makeProject(i + 1))
  const result = await getLatestDevelopmentProjects(10, mockDb(rows))
  assert.equal(result.length, 3)
})
