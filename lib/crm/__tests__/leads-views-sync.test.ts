/**
 * CRM-LEADS-SYNC-01 (G-23) — câblage : statistiques, tableau et pipeline
 * partagent une seule liste de leads (état unique dans LeadsViewTabs).
 * Test statique : le dépôt n'a pas d'outillage de rendu React côté tests.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const tabs = readFileSync("components/admin/leads-view-tabs.tsx", "utf8")
const table = readFileSync("components/admin/leads-table.tsx", "utf8")
const pipeline = readFileSync("components/admin/lead-pipeline.tsx", "utf8")

test("une seule liste de leads, passée aux 3 vues avec le même rappel", () => {
  assert.match(tabs, /useState<LeadRow\[\]>\(initialLeads\)/)
  assert.match(tabs, /<LeadStatsBar leads=\{leads\}/)
  assert.equal(tabs.match(/onLeadChange=\{patchLead\}/g)?.length, 2)
})

test("tableau : changement de statut et conversion remontés au parent ; resynchro depuis le pipeline", () => {
  assert.match(
    table,
    /onLeadChange\?\.\(lead\.id, \{ status: next, updatedAt: now \}\)/,
  )
  assert.match(table, /status: "converted",[\s\S]*?reservationId,/)
  assert.match(table, /if \(initialLead\.status !== seenStatus\)/)
})

test("pipeline : utilise l'état partagé quand il est fourni", () => {
  assert.match(
    pipeline,
    /const leads = onLeadChange \? initialLeads : localLeads/,
  )
  assert.match(
    pipeline,
    /onLeadChange\(id, \{ status: next, updatedAt: new Date\(\) \}\)/,
  )
})
