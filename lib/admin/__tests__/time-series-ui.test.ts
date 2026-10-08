/**
 * TIME-SERIES-01 — invariants statiques.
 * Vérifie que les 3 artefacts du chantier existent et sont correctement
 * reliés, sans lancer de serveur ni de base de données.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(process.cwd())

describe("TIME-SERIES-01 — invariants statiques", () => {
  const shellSource = readFileSync(
    join(ROOT, "components/admin-shell.tsx"),
    "utf8",
  )
  const actionSource = readFileSync(
    join(ROOT, "lib/admin/time-series-actions.ts"),
    "utf8",
  )

  test('admin-shell.tsx contient le href "/admin/analytics/trends"', () => {
    assert.ok(
      shellSource.includes('"/admin/analytics/trends"'),
      'admin-shell.tsx doit contenir href "/admin/analytics/trends"',
    )
  })

  test("time-series-actions.ts exporte getTimeSeries", () => {
    assert.ok(
      actionSource.includes("export async function getTimeSeries"),
      "lib/admin/time-series-actions.ts doit exporter getTimeSeries",
    )
  })

  test("page trends existe", () => {
    const pagePath = join(
      ROOT,
      "app/(internal)/admin/analytics/trends/page.tsx",
    )
    assert.ok(
      existsSync(pagePath),
      `app/(internal)/admin/analytics/trends/page.tsx doit exister`,
    )
  })
})
