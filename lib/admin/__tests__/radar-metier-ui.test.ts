/**
 * RADAR-METIER-01 — invariants statiques.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(process.cwd())

describe("RADAR-METIER-01 — invariants statiques", () => {
  const shellSource = readFileSync(
    join(ROOT, "components/admin-shell.tsx"),
    "utf8",
  )
  const actionSource = readFileSync(
    join(ROOT, "lib/admin/radar-metier-actions.ts"),
    "utf8",
  )

  test('admin-shell.tsx contient le href "/admin/analytics/radar"', () => {
    assert.ok(
      shellSource.includes('"/admin/analytics/radar"'),
      'admin-shell.tsx doit contenir href "/admin/analytics/radar"',
    )
  })

  test("radar-metier-actions.ts exporte getRadarMetier", () => {
    assert.ok(
      actionSource.includes("export async function getRadarMetier"),
      "lib/admin/radar-metier-actions.ts doit exporter getRadarMetier",
    )
  })

  test("page radar existe", () => {
    const pagePath = join(ROOT, "app/(internal)/admin/analytics/radar/page.tsx")
    assert.ok(
      existsSync(pagePath),
      `app/(internal)/admin/analytics/radar/page.tsx doit exister`,
    )
  })
})
