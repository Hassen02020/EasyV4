/**
 * CAMPAIGN-MGMT-01 — invariants statiques.
 * Vérifie que les 3 artefacts du chantier existent et sont correctement
 * reliés, sans lancer de serveur ni de base de données.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(process.cwd())

describe("CAMPAIGN-MGMT-01 — invariants statiques", () => {
  const actionsSource = readFileSync(
    join(ROOT, "lib/admin/campaign-mgmt-actions.ts"),
    "utf8",
  )
  const coreSource = readFileSync(
    join(ROOT, "lib/crm/campaign-persistence-core.ts"),
    "utf8",
  )
  const pageSource = readFileSync(
    join(ROOT, "app/(internal)/admin/analytics/campaigns/page.tsx"),
    "utf8",
  )

  test("campaign-mgmt-actions.ts exporte cancelCampaign", () => {
    assert.ok(
      actionsSource.includes("export async function cancelCampaign"),
      "campaign-mgmt-actions.ts doit exporter cancelCampaign",
    )
  })

  test("campaign-mgmt-actions.ts exporte getCampaignTargets", () => {
    assert.ok(
      actionsSource.includes("export async function getCampaignTargets"),
      "campaign-mgmt-actions.ts doit exporter getCampaignTargets",
    )
  })

  test("campaign-persistence-core.ts exporte cancelCampaignCore", () => {
    assert.ok(
      coreSource.includes("export async function cancelCampaignCore"),
      "campaign-persistence-core.ts doit exporter cancelCampaignCore",
    )
  })

  test("cancelCampaignCore refuse les campagnes déjà terminales (completed/cancelled)", () => {
    assert.ok(
      coreSource.includes("CAMPAIGN_ALREADY_TERMINAL"),
      "cancelCampaignCore doit retourner CAMPAIGN_ALREADY_TERMINAL pour les campagnes déjà terminales",
    )
  })

  test("CampaignTargetRow inclut deliveryStatus et deliveredAt", () => {
    assert.ok(
      coreSource.includes("deliveryStatus: string"),
      "CampaignTargetRow doit contenir deliveryStatus",
    )
    assert.ok(
      coreSource.includes("deliveredAt: Date | null"),
      "CampaignTargetRow doit contenir deliveredAt",
    )
  })

  test("page campaigns importe cancelCampaign et getCampaignTargets", () => {
    assert.ok(
      pageSource.includes("cancelCampaign"),
      "page.tsx doit importer et utiliser cancelCampaign",
    )
    assert.ok(
      pageSource.includes("getCampaignTargets"),
      "page.tsx doit importer et utiliser getCampaignTargets",
    )
  })

  test("page campaigns affiche bouton Annuler pour campagnes actives/draft", () => {
    assert.ok(
      pageSource.includes("Annuler"),
      'page.tsx doit contenir le texte "Annuler"',
    )
    assert.ok(
      pageSource.includes('r.status === "active"'),
      'page.tsx doit conditionner le bouton sur status === "active"',
    )
  })

  test("campaign-mgmt-actions.ts est un fichier use server", () => {
    assert.ok(
      actionsSource.startsWith('"use server"'),
      'campaign-mgmt-actions.ts doit commencer par "use server"',
    )
  })

  test("page campaigns exporte CampaignTargetsPanel (drill-down cibles)", () => {
    assert.ok(
      pageSource.includes("CampaignTargetsPanel"),
      "page.tsx doit contenir CampaignTargetsPanel pour le drill-down des cibles",
    )
  })
})
