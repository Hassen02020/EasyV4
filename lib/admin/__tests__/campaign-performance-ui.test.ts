/**
 * CAMPAIGN-PERF-UI-01 — invariants statiques.
 * Vérifie que les 3 artefacts du chantier existent et sont correctement
 * reliés, sans lancer de serveur ni de base de données.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(process.cwd())

describe("CAMPAIGN-PERF-UI-01 — invariants statiques", () => {
  const shellSource = readFileSync(
    join(ROOT, "components/admin-shell.tsx"),
    "utf8",
  )
  const actionSource = readFileSync(
    join(ROOT, "lib/admin/campaign-performance-actions.ts"),
    "utf8",
  )

  test('admin-shell.tsx contient le href "/admin/analytics/campaigns"', () => {
    assert.ok(
      shellSource.includes('"/admin/analytics/campaigns"'),
      'admin-shell.tsx doit contenir href "/admin/analytics/campaigns"',
    )
  })

  test("campaign-performance-actions.ts exporte listCampaignPerformance", () => {
    assert.ok(
      actionSource.includes("export async function listCampaignPerformance"),
      "lib/admin/campaign-performance-actions.ts doit exporter listCampaignPerformance",
    )
  })

  test("page campaigns existe", () => {
    const pagePath = join(
      ROOT,
      "app/(internal)/admin/analytics/campaigns/page.tsx",
    )
    assert.ok(
      existsSync(pagePath),
      `app/(internal)/admin/analytics/campaigns/page.tsx doit exister`,
    )
  })

  test("CampaignPerformance inclut les champs delivery stats (sent/failed/skipped/pending/totalTargets)", () => {
    const coreSource = readFileSync(
      join(ROOT, "lib/crm/campaign-performance-core.ts"),
      "utf8",
    )
    for (const field of [
      "sent:",
      "failed:",
      "skipped:",
      "pending:",
      "totalTargets:",
    ]) {
      assert.ok(
        coreSource.includes(field),
        `campaign-performance-core.ts doit contenir le champ "${field}" dans CampaignPerformance`,
      )
    }
  })

  test("page campaigns affiche les colonnes livraison (Envoyés/Échecs/Ignorés/En attente)", () => {
    const pageSource = readFileSync(
      join(ROOT, "app/(internal)/admin/analytics/campaigns/page.tsx"),
      "utf8",
    )
    for (const col of ["Envoyés", "Échecs", "Ignorés", "En attente"]) {
      assert.ok(
        pageSource.includes(col),
        `page.tsx doit contenir la colonne "${col}"`,
      )
    }
  })
})
