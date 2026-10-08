/**
 * RADAR-VIP-01/02 — invariants statiques.
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

describe("RADAR-VIP-02 — déduplication contactuelle", () => {
  const actionSource = readFileSync(
    join(ROOT, "lib/admin/radar-vip-actions.ts"),
    "utf8",
  )
  const pageSource = readFileSync(
    join(ROOT, "app/(internal)/admin/analytics/vip/page.tsx"),
    "utf8",
  )

  test("VipRadarRow contient leadCount", () => {
    assert.ok(
      actionSource.includes("leadCount"),
      "VipRadarRow doit contenir leadCount (RADAR-VIP-02)",
    )
  })

  test("VipRadarRow contient products", () => {
    assert.ok(
      actionSource.includes("products: string[]"),
      "VipRadarRow doit contenir products: string[] (RADAR-VIP-02)",
    )
  })

  test("action implémente une clé de déduplication contactKey", () => {
    assert.ok(
      actionSource.includes("contactKey"),
      "radar-vip-actions.ts doit implémenter la fonction contactKey",
    )
  })

  test("page affiche le badge leadCount", () => {
    assert.ok(
      pageSource.includes("leadCount"),
      "page.tsx doit utiliser row.leadCount pour afficher le badge ×N",
    )
  })

  test("page affiche les produits fusionnés", () => {
    assert.ok(
      pageSource.includes("row.products"),
      "page.tsx doit afficher row.products (liste des produits du groupe)",
    )
  })
})
