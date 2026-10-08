/**
 * CONVERSION-FUNNEL-01 — invariants statiques.
 * Vérifie que les 3 artefacts du chantier existent et sont correctement
 * reliés, sans lancer de serveur ni de base de données.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(process.cwd())

describe("CONVERSION-FUNNEL-01 — invariants statiques", () => {
  const shellSource = readFileSync(
    join(ROOT, "components/admin-shell.tsx"),
    "utf8",
  )
  const actionSource = readFileSync(
    join(ROOT, "lib/admin/conversion-funnel-actions.ts"),
    "utf8",
  )

  test('admin-shell.tsx contient le href "/admin/analytics/conversion"', () => {
    assert.ok(
      shellSource.includes('"/admin/analytics/conversion"'),
      'admin-shell.tsx doit contenir href "/admin/analytics/conversion"',
    )
  })

  test("conversion-funnel-actions.ts exporte getConversionFunnel", () => {
    assert.ok(
      actionSource.includes("export async function getConversionFunnel"),
      "lib/admin/conversion-funnel-actions.ts doit exporter getConversionFunnel",
    )
  })

  test("page conversion existe", () => {
    const pagePath = join(
      ROOT,
      "app/(internal)/admin/analytics/conversion/page.tsx",
    )
    assert.ok(
      existsSync(pagePath),
      `app/(internal)/admin/analytics/conversion/page.tsx doit exister`,
    )
  })
})
