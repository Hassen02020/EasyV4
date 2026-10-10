"use server"

/**
 * CRM-C — Task Management : Server Actions pour /admin/support.
 * Même patron que lib/admin/leads-actions.ts (assertSupportStaff).
 */

import { revalidatePath } from "next/cache"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  createTaskCore,
  completeTaskCore,
  cancelTaskCore,
  listMyTasksCore,
  listAllOpenTasksCore,
  listLeadTasksCore,
  CRM_TASK_TYPES,
  type TaskRow,
  type CreateTaskInput,
} from "@/lib/crm/task-core"

export type { TaskRow }

const SUPPORT_STAFF_ROLES = ["super_admin", "manager", "agent_resa"] as const

interface StaffCtx {
  userId: string
  agencyId: string
}

async function assertSupportStaff(): Promise<StaffCtx> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("NOT_AUTHENTICATED")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !profile.agencyId) throw new Error("FORBIDDEN")
  if (!(SUPPORT_STAFF_ROLES as readonly string[]).includes(profile.role ?? ""))
    throw new Error("FORBIDDEN")
  if (profile.agencyType !== "ota") throw new Error("FORBIDDEN")

  return { userId: user.id, agencyId: profile.agencyId }
}

/* ── list ─────────────────────────────────────────────────────────────────── */

export type ListTasksResult =
  | { ok: true; tasks: TaskRow[] }
  | { ok: false; error: string }

export async function listMyTasks(): Promise<ListTasksResult> {
  try {
    const { userId, agencyId } = await assertSupportStaff()
    const tasks = await withTenantContext(
      { agencyId, userId, isSuperAdmin: false },
      (tx) => listMyTasksCore(tx, agencyId, userId),
    )
    return { ok: true, tasks }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function listAllOpenTasks(): Promise<ListTasksResult> {
  try {
    const { userId, agencyId } = await assertSupportStaff()
    const tasks = await withTenantContext(
      { agencyId, userId, isSuperAdmin: false },
      (tx) => listAllOpenTasksCore(tx, agencyId),
    )
    return { ok: true, tasks }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function listLeadTasks(leadId: string): Promise<ListTasksResult> {
  try {
    const { userId, agencyId } = await assertSupportStaff()
    const tasks = await withTenantContext(
      { agencyId, userId, isSuperAdmin: false },
      (tx) => listLeadTasksCore(tx, agencyId, leadId),
    )
    return { ok: true, tasks }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/* ── create ───────────────────────────────────────────────────────────────── */

export type CreateTaskResult =
  | { ok: true; task: TaskRow }
  | { ok: false; error: string }

export async function createTask(
  input: CreateTaskInput,
): Promise<CreateTaskResult> {
  try {
    if (!CRM_TASK_TYPES.includes(input.type)) {
      return { ok: false, error: `Type de tâche invalide : ${input.type}` }
    }
    if (!input.title?.trim()) {
      return { ok: false, error: "Le titre de la tâche est requis" }
    }
    const { userId, agencyId } = await assertSupportStaff()
    const task = await withTenantContext(
      { agencyId, userId, isSuperAdmin: false },
      (tx) => createTaskCore(tx, agencyId, userId, input),
    )
    revalidatePath("/admin/support")
    return { ok: true, task }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/* ── complete / cancel ────────────────────────────────────────────────────── */

export type TaskMutationResult =
  | { ok: true; task: TaskRow }
  | { ok: false; error: string }

export async function completeTask(
  taskId: string,
): Promise<TaskMutationResult> {
  try {
    const { userId, agencyId } = await assertSupportStaff()
    const task = await withTenantContext(
      { agencyId, userId, isSuperAdmin: false },
      (tx) => completeTaskCore(tx, agencyId, taskId),
    )
    revalidatePath("/admin/support")
    return { ok: true, task }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function cancelTask(taskId: string): Promise<TaskMutationResult> {
  try {
    const { userId, agencyId } = await assertSupportStaff()
    const task = await withTenantContext(
      { agencyId, userId, isSuperAdmin: false },
      (tx) => cancelTaskCore(tx, agencyId, taskId),
    )
    revalidatePath("/admin/support")
    return { ok: true, task }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
