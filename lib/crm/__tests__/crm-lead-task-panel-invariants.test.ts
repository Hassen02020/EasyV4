/**
 * CRM-LEAD-TASK-01 — Invariants statiques du panneau tâches par lead.
 * Vérifient le câblage sans exécution réseau.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it } from "node:test"
import assert from "node:assert/strict"

const root = resolve(import.meta.dirname, "../../..")

function readSrc(rel: string): string {
  return readFileSync(resolve(root, rel), "utf-8")
}

const panel = readSrc("components/admin/lead-tasks-panel.tsx")
const c360 = readSrc("components/admin/customer-360-panel.tsx")
const taskActions = readSrc("lib/admin/task-actions.ts")
const taskCore = readSrc("lib/crm/task-core.ts")

describe("CRM-LEAD-TASK-01 invariants", () => {
  it("LeadTasksPanel importe listLeadTasks depuis task-actions", () => {
    assert.ok(
      panel.includes("listLeadTasks"),
      "LeadTasksPanel doit appeler listLeadTasks",
    )
    assert.ok(
      panel.includes('from "@/lib/admin/task-actions"'),
      "Import depuis task-actions",
    )
  })

  it("LeadTasksPanel crée les tâches avec leadId pré-rempli", () => {
    assert.ok(
      panel.includes("leadId"),
      "LeadTasksPanel doit transmettre leadId à createTask",
    )
    assert.ok(
      panel.includes("createTask"),
      "LeadTasksPanel doit appeler createTask",
    )
  })

  it("LeadTasksPanel ne crée pas de nouveau server action (réutilise task-actions)", () => {
    assert.ok(
      !panel.includes('"use server"'),
      "LeadTasksPanel est un composant client — pas de use server",
    )
  })

  it("LeadTasksPanel expose completeTask et cancelTask", () => {
    assert.ok(panel.includes("completeTask"), "completeTask présent")
    assert.ok(panel.includes("cancelTask"), "cancelTask présent")
  })

  it("customer-360-panel importe LeadTasksPanel", () => {
    assert.ok(
      c360.includes("LeadTasksPanel"),
      "Customer360 doit importer LeadTasksPanel",
    )
    assert.ok(
      c360.includes('from "@/components/admin/lead-tasks-panel"'),
      "Import chemin correct",
    )
  })

  it("customer-360-panel transmet leadId à LeadTasksPanel", () => {
    assert.ok(
      c360.includes("<LeadTasksPanel leadId={leadId}"),
      "LeadTasksPanel reçoit leadId depuis Customer360",
    )
  })

  it("task-actions expose listLeadTasks(leadId) comme server action", () => {
    assert.ok(
      taskActions.includes("export async function listLeadTasks"),
      "listLeadTasks est exporté",
    )
    assert.ok(
      taskActions.includes("leadId: string"),
      "listLeadTasks prend un leadId string",
    )
  })

  it("task-core expose listLeadTasksCore filtrant par leadId ET agencyId", () => {
    assert.ok(
      taskCore.includes("listLeadTasksCore"),
      "listLeadTasksCore présent dans task-core",
    )
    assert.ok(
      taskCore.includes("eq(crmTasks.leadId, leadId)"),
      "Filtre sur leadId présent — isolation lead",
    )
    assert.ok(
      taskCore.includes("eq(crmTasks.agencyId, agencyId)"),
      "Filtre sur agencyId présent — isolation agence",
    )
  })
})
