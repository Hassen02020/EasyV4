/**
 * RADAR-VIP-01 — invariants statiques.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(process.cwd())

describe("RADAR-VIP-01 — invariants statiques", () => {
  const shellSource = readFileSync(
    join(ROOT, "components/admin-shell.tsx"),
    "utf8",
  )
  const actionSource = readFileSync(
    join(ROOT, "lib/admin/radar-vip-actions.ts"),
    "utf8",
  )

  test('admin-shell.tsx contient le href "/admin/analytics/vip"', () => {
    assert.ok(
      shellSource.includes('"/admin/analytics/vip"'),
      'admin-shell.tsx doit contenir href "/admin/analytics/vip"',
    )
  })

  test("radar-vip-actions.ts exporte getRadarVip", () => {
    assert.ok(
      actionSource.includes("export async function getRadarVip"),
      "lib/admin/radar-vip-actions.ts doit exporter getRadarVip",
    )
  })

  test("page vip existe", () => {
    const pagePath = join(
      ROOT,
      "app/(internal)/admin/analytics/vip/page.tsx",
    )
    assert.ok(
      existsSync(pagePath),
      `app/(internal)/admin/analytics/vip/page.tsx doit exister`,
    )
  })
})
