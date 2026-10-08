/**
 * ANALYTICS-OVERVIEW-01 — invariants statiques.
 * Vérifie que la page d'accueil /admin/analytics existe et contient
 * les 12 liens vers les sous-sections analytics.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(process.cwd())
const pageSource = readFileSync(
  join(ROOT, "app/(internal)/admin/analytics/page.tsx"),
  "utf8",
)

const EXPECTED_HREFS = [
  "/admin/analytics/margins",
  "/admin/analytics/niches",
  "/admin/analytics/search-demand",
  "/admin/analytics/campaigns",
  "/admin/analytics/conversion",
  "/admin/analytics/trends",
  "/admin/analytics/radar",
  "/admin/analytics/vip",
  "/admin/analytics/signal",
  "/admin/analytics/action",
  "/admin/analytics/learning",
  "/admin/analytics/campaign-engine",
]

describe("ANALYTICS-OVERVIEW-01 — invariants statiques", () => {
  test("page.tsx est un Server Component (pas de 'use client')", () => {
    assert.ok(
      !pageSource.includes('"use client"'),
      "page.tsx ne doit pas être un Client Component",
    )
  })

  test("page.tsx exporte un composant par défaut", () => {
    assert.ok(
      pageSource.includes("export default function"),
      "page.tsx doit exporter une fonction par défaut",
    )
  })

  for (const href of EXPECTED_HREFS) {
    test(`page.tsx contient le lien ${href}`, () => {
      assert.ok(
        pageSource.includes(href),
        `page.tsx doit contenir le lien ${href}`,
      )
    })
  }

  test("page.tsx contient 12 sections (SECTIONS.length === 12)", () => {
    const matches = [...pageSource.matchAll(/\/admin\/analytics\//g)]
    assert.ok(
      matches.length >= 12,
      `page.tsx doit référencer au moins 12 liens analytics (trouvé ${matches.length})`,
    )
  })
})
