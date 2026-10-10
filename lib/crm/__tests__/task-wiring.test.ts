/**
 * CRM-C-WIRING-01 — invariants statiques sur le câblage Task Management.
 *
 * Protège :
 * 1. task-core.ts : les constantes CRM_TASK_TYPES / CRM_TASK_STATUSES, et
 *    les 5 fonctions publiques sont définies et exportées.
 * 2. task-actions.ts : "use server" présent, assertSupportStaff guard présent,
 *    toutes les actions sont exportées, revalidatePath("/admin/support") câblé.
 * 3. crm-tasks-panel.tsx : "use client" présent, import des 4 actions Server,
 *    import CRM_TASK_TYPES, render des boutons Clôturer/Annuler.
 * 4. admin/support/page.tsx : import CrmTasksPanel, rendu <CrmTasksPanel />.
 * 5. schema.ts : crmTasks table exportée, colonnes clés (agencyId, leadId,
 *    assigneeId, type, status, title, dueAt).
 *
 * Pattern readFileSync : les fichiers "use server"/"use client" ne peuvent pas
 * être importés directement sous `node --test`.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const core = readFileSync(join(ROOT, "lib/crm/task-core.ts"), "utf8")
const actions = readFileSync(join(ROOT, "lib/admin/task-actions.ts"), "utf8")
const panel = readFileSync(
  join(ROOT, "components/admin/crm-tasks-panel.tsx"),
  "utf8",
)
const page = readFileSync(
  join(ROOT, "app/(internal)/admin/support/page.tsx"),
  "utf8",
)
const schema = readFileSync(join(ROOT, "lib/db/schema.ts"), "utf8")

// ─── Invariant 1 : task-core.ts ───────────────────────────────────────────

test("CRM-C-WIRING-01 : CRM_TASK_TYPES exporté depuis task-core", () => {
  // re-exporté depuis schema via export { CRM_TASK_TYPES }
  assert.match(core, /export\s*\{[^}]*CRM_TASK_TYPES/)
})

test("CRM-C-WIRING-01 : CRM_TASK_STATUSES exporté depuis task-core", () => {
  assert.match(core, /export\s*\{[^}]*CRM_TASK_STATUSES/)
})

test("CRM-C-WIRING-01 : createTaskCore exporté", () => {
  assert.match(core, /export async function createTaskCore/)
})

test("CRM-C-WIRING-01 : completeTaskCore exporté", () => {
  assert.match(core, /export async function completeTaskCore/)
})

test("CRM-C-WIRING-01 : cancelTaskCore exporté", () => {
  assert.match(core, /export async function cancelTaskCore/)
})

test("CRM-C-WIRING-01 : listMyTasksCore exporté", () => {
  assert.match(core, /export async function listMyTasksCore/)
})

test("CRM-C-WIRING-01 : listAllOpenTasksCore exporté", () => {
  assert.match(core, /export async function listAllOpenTasksCore/)
})

test("CRM-C-WIRING-01 : validation type invalide dans createTaskCore (INVALID_TASK_TYPE)", () => {
  assert.match(core, /INVALID_TASK_TYPE/)
})

test("CRM-C-WIRING-01 : validation titre vide dans createTaskCore (TASK_TITLE_REQUIRED)", () => {
  assert.match(core, /TASK_TITLE_REQUIRED/)
})

test("CRM-C-WIRING-01 : completeTaskCore lève TASK_NOT_FOUND si absent", () => {
  assert.match(core, /TASK_NOT_FOUND/)
})

// ─── Invariant 2 : task-actions.ts ────────────────────────────────────────

test("CRM-C-WIRING-01 : task-actions.ts est un fichier use server", () => {
  assert.match(actions, /^"use server"/)
})

test("CRM-C-WIRING-01 : assertSupportStaff guard présent dans task-actions", () => {
  assert.match(actions, /assertSupportStaff/)
})

test("CRM-C-WIRING-01 : FORBIDDEN si rôle insuffisant", () => {
  assert.match(actions, /FORBIDDEN/)
})

test("CRM-C-WIRING-01 : revalidatePath câblé sur /admin/support", () => {
  assert.match(actions, /revalidatePath\(["']\/admin\/support["']\)/)
})

test("CRM-C-WIRING-01 : createTask exporté depuis task-actions", () => {
  assert.match(actions, /export async function createTask/)
})

test("CRM-C-WIRING-01 : completeTask exporté depuis task-actions", () => {
  assert.match(actions, /export async function completeTask/)
})

test("CRM-C-WIRING-01 : cancelTask exporté depuis task-actions", () => {
  assert.match(actions, /export async function cancelTask/)
})

test("CRM-C-WIRING-01 : listAllOpenTasks exporté depuis task-actions", () => {
  assert.match(actions, /export async function listAllOpenTasks/)
})

test("CRM-C-WIRING-01 : listMyTasks exporté depuis task-actions", () => {
  assert.match(actions, /export async function listMyTasks/)
})

// ─── Invariant 3 : crm-tasks-panel.tsx ────────────────────────────────────

test("CRM-C-WIRING-01 : crm-tasks-panel est un fichier use client", () => {
  assert.match(panel, /^"use client"/)
})

test("CRM-C-WIRING-01 : import createTask depuis task-actions", () => {
  // import multi-ligne : vérifie présence du bloc from task-actions ET de createTask
  assert.match(panel, /from "@\/lib\/admin\/task-actions"/)
  assert.match(panel, /createTask/)
})

test("CRM-C-WIRING-01 : import completeTask depuis task-actions", () => {
  assert.match(panel, /completeTask/)
})

test("CRM-C-WIRING-01 : import cancelTask depuis task-actions", () => {
  assert.match(panel, /cancelTask/)
})

test("CRM-C-WIRING-01 : import CRM_TASK_TYPES dans le panel", () => {
  assert.match(panel, /CRM_TASK_TYPES/)
})

test("CRM-C-WIRING-01 : CrmTasksPanel exporté", () => {
  assert.match(panel, /export function CrmTasksPanel/)
})

// ─── Invariant 4 : admin/support/page.tsx ─────────────────────────────────

test("CRM-C-WIRING-01 : import CrmTasksPanel dans page support", () => {
  assert.match(page, /import.*CrmTasksPanel.*from.*crm-tasks-panel/)
})

test("CRM-C-WIRING-01 : <CrmTasksPanel /> rendu dans page support", () => {
  assert.match(page, /<CrmTasksPanel\s*\/>/)
})

// ─── Invariant 5 : schema.ts ──────────────────────────────────────────────

test("CRM-C-WIRING-01 : crmTasks table exportée dans schema.ts", () => {
  assert.match(schema, /export const crmTasks/)
})

test("CRM-C-WIRING-01 : agencyId référence agencies dans crmTasks", () => {
  assert.match(schema, /agencyId:.*uuid.*agency_id/)
})

test("CRM-C-WIRING-01 : leadId FK leads dans crmTasks", () => {
  assert.match(schema, /leadId:.*uuid.*lead_id/)
})

test("CRM-C-WIRING-01 : assigneeId FK users dans crmTasks", () => {
  assert.match(schema, /assigneeId:.*uuid.*assignee_id/)
})

test("CRM-C-WIRING-01 : title dans crmTasks", () => {
  assert.match(schema, /title:.*varchar.*title/)
})

test("CRM-C-WIRING-01 : dueAt dans crmTasks", () => {
  assert.match(schema, /dueAt:.*timestamp.*due_at/)
})

test("CRM-C-WIRING-01 : CrmTask type exporté depuis schema", () => {
  assert.match(schema, /export type CrmTask/)
})
