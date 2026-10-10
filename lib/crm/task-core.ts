/**
 * CRM-C — Task Management core.
 * Pas un fichier "use server" — testable directement contre une transaction DB.
 * agencyId toujours résolu par l'appelant (withTenantContext ou assertSupportStaff).
 */

import { and, eq, desc } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  crmTasks,
  CRM_TASK_TYPES,
  CRM_TASK_STATUSES,
  type CrmTask,
  type CrmTaskType,
  type CrmTaskStatus,
} from "@/lib/db/schema"

export { CRM_TASK_TYPES, CRM_TASK_STATUSES }
export type { CrmTask, CrmTaskType, CrmTaskStatus }

export interface CreateTaskInput {
  leadId?: string | null
  assigneeId?: string | null
  type: CrmTaskType
  title: string
  notes?: string | null
  dueAt?: Date | null
}

export interface TaskRow {
  id: string
  agencyId: string
  leadId: string | null
  assigneeId: string | null
  createdBy: string | null
  type: CrmTaskType
  status: CrmTaskStatus
  title: string
  notes: string | null
  dueAt: Date | null
  doneAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export async function createTaskCore(
  tx: DrizzleTransaction,
  agencyId: string,
  createdBy: string,
  input: CreateTaskInput,
): Promise<TaskRow> {
  if (!CRM_TASK_TYPES.includes(input.type)) {
    throw new Error(`INVALID_TASK_TYPE: ${input.type}`)
  }
  const title = input.title?.trim()
  if (!title) throw new Error("TASK_TITLE_REQUIRED")

  const [row] = await tx
    .insert(crmTasks)
    .values({
      agencyId,
      leadId: input.leadId ?? null,
      assigneeId: input.assigneeId ?? null,
      createdBy,
      type: input.type,
      title,
      notes: input.notes ?? null,
      dueAt: input.dueAt ?? null,
    })
    .returning()
  return row as TaskRow
}

export async function completeTaskCore(
  tx: DrizzleTransaction,
  agencyId: string,
  taskId: string,
): Promise<TaskRow> {
  const now = new Date()
  const [row] = await tx
    .update(crmTasks)
    .set({ status: "done", doneAt: now, updatedAt: now })
    .where(and(eq(crmTasks.id, taskId), eq(crmTasks.agencyId, agencyId)))
    .returning()
  if (!row) throw new Error("TASK_NOT_FOUND")
  return row as TaskRow
}

export async function cancelTaskCore(
  tx: DrizzleTransaction,
  agencyId: string,
  taskId: string,
): Promise<TaskRow> {
  const now = new Date()
  const [row] = await tx
    .update(crmTasks)
    .set({ status: "cancelled", updatedAt: now })
    .where(and(eq(crmTasks.id, taskId), eq(crmTasks.agencyId, agencyId)))
    .returning()
  if (!row) throw new Error("TASK_NOT_FOUND")
  return row as TaskRow
}

export async function listMyTasksCore(
  tx: DrizzleTransaction,
  agencyId: string,
  assigneeId: string,
): Promise<TaskRow[]> {
  const rows = await tx
    .select()
    .from(crmTasks)
    .where(
      and(
        eq(crmTasks.agencyId, agencyId),
        eq(crmTasks.assigneeId, assigneeId),
        eq(crmTasks.status, "open"),
      ),
    )
    .orderBy(crmTasks.dueAt, desc(crmTasks.createdAt))
  return rows as TaskRow[]
}

export async function listLeadTasksCore(
  tx: DrizzleTransaction,
  agencyId: string,
  leadId: string,
): Promise<TaskRow[]> {
  const rows = await tx
    .select()
    .from(crmTasks)
    .where(and(eq(crmTasks.agencyId, agencyId), eq(crmTasks.leadId, leadId)))
    .orderBy(desc(crmTasks.createdAt))
  return rows as TaskRow[]
}

export async function listAllOpenTasksCore(
  tx: DrizzleTransaction,
  agencyId: string,
): Promise<TaskRow[]> {
  const rows = await tx
    .select()
    .from(crmTasks)
    .where(and(eq(crmTasks.agencyId, agencyId), eq(crmTasks.status, "open")))
    .orderBy(crmTasks.dueAt, desc(crmTasks.createdAt))
  return rows as TaskRow[]
}
