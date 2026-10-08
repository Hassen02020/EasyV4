/**
 * ADMIN-ANALYTICS-NAV-01 — invariant statique vérifiant que les trois hrefs
 * analytics sont présents dans le fichier admin-shell.tsx. Régression rapide
 * sans DOM ni rendu React.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const shellSource = readFileSync(
  join(process.cwd(), "components/admin-shell.tsx"),
  "utf8",
)

const EXPECTED_HREFS = [
  "/admin/analytics/margins",
  "/admin/analytics/niches",
  "/admin/analytics/search-demand",
] as const

for (const href of EXPECTED_HREFS) {
  test(`admin-shell.tsx contient le href analytics "${href}"`, () => {
    assert.ok(
      shellSource.includes(`"${href}"`),
      `Href manquant dans admin-shell.tsx : ${href}`,
    )
  })
}
