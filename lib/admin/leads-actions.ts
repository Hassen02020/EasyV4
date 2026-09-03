"use server"

/**
 * CRM / Leads — gestion staff (`/admin/support`, fixe un lien de nav mort :
 * "Support & Clients" pointait vers /admin/support, qui n'a jamais existé).
 *
 * Même patron que lib/admin/product-guard.ts::assertProductManager, avec un
 * jeu de rôles distinct : suivre les demandes de contact est une tâche
 * courante d'agent réservation, pas réservée aux managers (contrairement à
 * la gestion catalogue) — mêmes 3 rôles que la file de validations
 * (app/admin/validations/page.tsx) et que "Support & Clients" dans la nav
 * (components/admin-shell.tsx::managerNavItems, index visible par
 * super_admin/manager/agent_resa).
 */

import { revalidatePath } from "next/cache"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  listLeadsCore,
  updateLeadStatusCore,
  LEAD_STATUSES,
  type LeadRow,
  type LeadStatus,
} from "@/lib/crm/leads-core"

const SUPPORT_STAFF_ROLES = ["super_admin", "manager", "agent_resa"] as const

interface SupportStaffContext {
  userId: string
  agencyId: string
}

async function assertSupportStaff(): Promise<SupportStaffContext> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("NOT_AUTHENTICATED")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !profile.agencyId) throw new Error("FORBIDDEN")
  if (!(SUPPORT_STAFF_ROLES as readonly string[]).includes(profile.role ?? "")) {
    throw new Error("FORBIDDEN")
  }
  if (profile.agencyType !== "ota") throw new Error("FORBIDDEN")

  return { userId: user.id, agencyId: profile.agencyId }
}

export type ListLeadsResult = { ok: true; leads: LeadRow[] } | { ok: false; error: string }

export async function listLeads(status?: LeadStatus): Promise<ListLeadsResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  try {
    const rows = await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
      listLeadsCore(tx, { agencyId: ctx.agencyId, status }),
    )
    return { ok: true, leads: rows }
  } catch (err) {
    console.error("[listLeads]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type UpdateLeadStatusResult = { ok: true } | { ok: false; error: string }

export async function updateLeadStatus(input: {
  id: string
  status: LeadStatus
  staffNotes?: string
}): Promise<UpdateLeadStatusResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  if (!(LEAD_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: "Statut invalide." }
  }
  if (!input.id || typeof input.id !== "string") {
    return { ok: false, error: "Identifiant invalide." }
  }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) =>
        updateLeadStatusCore(tx, {
          agencyId: ctx.agencyId,
          id: input.id,
          status: input.status,
          staffNotes: input.staffNotes,
          handledByUserId: ctx.userId,
        }),
    )
    if (!result.updated) return { ok: false, error: "Demande introuvable." }
    revalidatePath("/admin/support")
    return { ok: true }
  } catch (err) {
    console.error("[updateLeadStatus]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

